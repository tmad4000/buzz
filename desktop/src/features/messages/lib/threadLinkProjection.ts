import { getThreadReference } from "@/features/messages/lib/threading";
import { threadLinkSignerAllowed } from "./threadLinkOrganizer";
import {
  isThreadLinkCandidate,
  parseThreadLink,
  threadMessageAuthor,
  validThreadLinkScope,
  verifiedThreadMessage,
} from "@/features/messages/lib/threadLinks";
import type {
  ThreadLinkAnnotation,
  ThreadLinkScope,
} from "@/features/messages/lib/threadLinks";

const HEX = /^[0-9a-f]{64}$/;
/** Snapshot bounds are deliberate; exceeding them is not an empty history. */
export const THREAD_LINK_LIMITS = {
  messages: 5000,
  annotations: 1000,
  depth: 100,
} as const;

/** Canonical fields are for transport; presentation fields are for rendering. */
export type ThreadProjection = {
  canonicalParentId: string | null;
  canonicalRootId: string | null;
  presentationParentId: string | null;
  presentationRootId: string | null;
  presentationDepth: number | null;
  annotationEventId: string | null;
};

/** Projection selection is distinct from acceptance by the stock relay. */
export type ThreadLinkDecision = {
  annotationId: string | null;
  childId: string | null;
  state: "selected" | "pending" | "conflict" | "rejected";
  reason: string;
};

/** This result never contains source bodies or modified signed event objects. */
export type ThreadLinkProjection = {
  scope: ThreadLinkScope;
  status: "complete" | "incomplete";
  messages: ReadonlyMap<string, ThreadProjection>;
  heads: ReadonlyMap<string, string>;
  decisions: ThreadLinkDecision[];
  issues: string[];
};

type MessageNode = {
  id: string;
  author: string;
  parentId: string | null;
  rootId: string | null;
};
type Trace =
  | { state: "ready"; root: string; depth: number }
  | { state: "pending" | "rejected"; reason: string; missingId?: string };

function traceParents(
  id: string,
  parents: ReadonlyMap<string, string | null>,
): Trace {
  const visited = new Set<string>();
  let cursor = id;
  let depth = 0;
  while (true) {
    if (visited.has(cursor)) return { state: "rejected", reason: "cycle" };
    visited.add(cursor);
    if (!parents.has(cursor)) {
      return {
        state: "pending",
        reason: "missing-ancestor",
        missingId: cursor,
      };
    }
    const parent = parents.get(cursor);
    if (parent == null) return { state: "ready", root: cursor, depth };
    if (++depth > THREAD_LINK_LIMITS.depth) {
      return { state: "rejected", reason: "depth-limit" };
    }
    cursor = parent;
  }
}

function candidateEdge(
  child: string,
  parent: string | null,
  parents: Map<string, string | null>,
  children: Map<string, Set<string>>,
): Trace {
  const previous = parents.get(child) ?? null;
  parents.set(child, parent);
  const trace = traceParents(child, parents);
  parents.set(child, previous);
  if (trace.state !== "ready") return trace;
  // Moving a subtree can overflow a descendant even if its new head fits.
  const queue: [string, number][] = [[child, trace.depth]];
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const [id, depth] = queue[index];
    if (visited.has(id)) return { state: "rejected", reason: "cycle" };
    visited.add(id);
    if (depth > THREAD_LINK_LIMITS.depth) {
      return { state: "rejected", reason: "depth-limit" };
    }
    for (const descendant of children.get(id) ?? []) {
      queue.push([descendant, depth + 1]);
    }
  }
  return trace;
}

function compareAnnotations(a: ThreadLinkAnnotation, b: ThreadLinkAnnotation) {
  return a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function eventId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && HEX.test(id) ? id : null;
}

/**
 * Compute an author-only overlay from a complete authenticated snapshot.
 * Incomplete history/closure leaves every message in its canonical position.
 * This does not fetch, persist, publish, mark read, or mutate input events.
 */
export function projectThreadLinks(input: {
  scope: ThreadLinkScope;
  messages: readonly unknown[];
  annotations: readonly unknown[];
  historyComplete: boolean;
  /** Only scope-fenced, successful authenticated reads can prove absence. */
  unavailableEventIds?: ReadonlySet<string>;
}): ThreadLinkProjection {
  const result: ThreadLinkProjection = {
    scope: { ...input.scope },
    status: "incomplete",
    messages: new Map(),
    heads: new Map(),
    decisions: [],
    issues: [],
  };
  if (!validThreadLinkScope(input.scope)) {
    result.issues.push("invalid-scope");
    return result;
  }
  if (
    input.messages.length > THREAD_LINK_LIMITS.messages ||
    input.annotations.length > THREAD_LINK_LIMITS.annotations
  ) {
    result.issues.push("snapshot-limit");
    return result;
  }
  const nodes = new Map<string, MessageNode>();
  for (const value of input.messages) {
    const event = verifiedThreadMessage(value, input.scope.channelId);
    if (!event || isThreadLinkCandidate(event)) {
      result.issues.push(`invalid-message:${eventId(value) ?? "unknown"}`);
      continue;
    }
    const ref = getThreadReference(event.tags);
    if (
      (ref.parentId !== null && !HEX.test(ref.parentId)) ||
      (ref.rootId !== null && !HEX.test(ref.rootId))
    ) {
      result.issues.push(`invalid-native-reference:${event.id}`);
      continue;
    }
    nodes.set(event.id, {
      id: event.id,
      author: threadMessageAuthor(event, input.scope),
      parentId: ref.parentId,
      rootId: ref.rootId,
    });
  }
  const parents = new Map([...nodes].map(([id, node]) => [id, node.parentId]));
  const children = new Map<string, Set<string>>();
  const canonical = new Map<string, ThreadProjection>();
  for (const [id, node] of nodes) {
    if (node.parentId) {
      const siblings = children.get(node.parentId) ?? new Set<string>();
      siblings.add(id);
      children.set(node.parentId, siblings);
    }
    const trace = traceParents(id, parents);
    if (trace.state !== "ready") {
      result.issues.push(`canonical-${trace.reason}:${id}`);
    } else if (node.rootId !== null && node.rootId !== trace.root) {
      result.issues.push(`canonical-root-mismatch:${id}`);
    }
    canonical.set(id, {
      canonicalParentId: node.parentId,
      canonicalRootId: node.rootId,
      presentationParentId: node.parentId,
      presentationRootId: node.rootId ?? id,
      presentationDepth: trace.state === "ready" ? trace.depth : null,
      annotationEventId: null,
    });
  }
  result.messages = canonical;
  const annotations = new Map<string, ThreadLinkAnnotation>();
  for (const value of input.annotations) {
    const parsed = parseThreadLink(value, input.scope);
    if (parsed.state === "valid") {
      annotations.set(parsed.annotation.id, parsed.annotation);
    } else {
      result.decisions.push({
        annotationId: eventId(value),
        childId: null,
        state: "rejected",
        reason: parsed.state === "invalid" ? parsed.reason : "not-annotation",
      });
    }
  }
  const heads = new Map<string, string>();
  for (const annotation of [...annotations.values()].sort(compareAnnotations)) {
    const decide = (state: ThreadLinkDecision["state"], reason: string) => {
      result.decisions.push({
        annotationId: annotation.id,
        childId: annotation.childId,
        state,
        reason,
      });
    };
    const node = nodes.get(annotation.childId);
    if (!node) {
      decide(
        input.unavailableEventIds?.has(annotation.childId)
          ? "rejected"
          : "pending",
        input.unavailableEventIds?.has(annotation.childId)
          ? "unavailable-child"
          : "missing-child",
      );
      continue;
    }
    if (
      !threadLinkSignerAllowed(
        annotation.authorPubkey,
        node.author,
        input.scope,
      )
    ) {
      decide("rejected", "not-child-author");
      continue;
    }
    if (!input.historyComplete) {
      decide("pending", "incomplete-history");
      continue;
    }
    if (annotation.previousId !== (heads.get(node.id) ?? null)) {
      if (
        annotation.previousId &&
        !annotations.has(annotation.previousId) &&
        input.unavailableEventIds?.has(annotation.previousId)
      ) {
        decide("rejected", "unavailable-predecessor");
        continue;
      }
      decide(
        annotation.previousId && !annotations.has(annotation.previousId)
          ? "pending"
          : "conflict",
        annotation.previousId && !annotations.has(annotation.previousId)
          ? "missing-predecessor"
          : "stale-head",
      );
      continue;
    }
    const parent =
      annotation.operation === "unlink" ? node.parentId : annotation.parentId;
    const trace = candidateEdge(node.id, parent, parents, children);
    if (trace.state !== "ready") {
      const unavailable =
        trace.missingId && input.unavailableEventIds?.has(trace.missingId);
      decide(
        unavailable ? "rejected" : trace.state,
        unavailable ? "unavailable-ancestor" : trace.reason,
      );
      continue;
    }
    const oldParent = parents.get(node.id);
    if (oldParent) children.get(oldParent)?.delete(node.id);
    if (parent) {
      const siblings = children.get(parent) ?? new Set<string>();
      siblings.add(node.id);
      children.set(parent, siblings);
    }
    parents.set(node.id, parent);
    heads.set(node.id, annotation.id);
    decide("selected", "author-link");
  }
  if (
    !input.historyComplete ||
    result.issues.length ||
    result.decisions.some((decision) => decision.state === "pending")
  ) {
    result.issues.push("incomplete-snapshot");
    result.decisions = result.decisions.map((decision) =>
      decision.state === "selected"
        ? { ...decision, state: "pending", reason: "incomplete-snapshot" }
        : decision,
    );
    return result;
  }
  const projected = new Map<string, ThreadProjection>();
  for (const [id, original] of canonical) {
    const trace = traceParents(id, parents);
    projected.set(id, {
      ...original,
      presentationParentId: parents.get(id) ?? null,
      presentationRootId: trace.state === "ready" ? trace.root : null,
      presentationDepth: trace.state === "ready" ? trace.depth : null,
      annotationEventId: heads.get(id) ?? null,
    });
  }
  result.status = "complete";
  result.messages = projected;
  result.heads = heads;
  return result;
}

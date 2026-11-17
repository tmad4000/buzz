import type { RelayEvent } from "@/shared/api/types";
import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";
import type { TimelineMessage } from "@/features/messages/types";
import type { ThreadLinkSnapshot } from "./threadLinkLoader";

export type ThreadOrganization = {
  annotationId: string;
  organizerPubkey: string;
  canonicalParentId: string | null;
  canonicalRootId: string | null;
  operation: "link" | "unlink";
};

/** Transport provenance/follow metadata always uses the original native root. */
export function canonicalThreadRootId(
  message: Pick<TimelineMessage, "id" | "rootId" | "canonicalRootId">,
): string {
  return message.canonicalRootId !== undefined
    ? (message.canonicalRootId ?? message.id)
    : (message.rootId ?? message.id);
}

/** Only view fields change; tags, source bodies, IDs and wire ancestry stay raw. */
export function applyThreadLinkPresentation(
  messages: TimelineMessage[],
  snapshot: ThreadLinkSnapshot | null,
): TimelineMessage[] {
  if (snapshot?.projection.status !== "complete") return messages;
  const selected = new Set(
    snapshot.projection.decisions
      .filter((d) => d.state === "selected")
      .map((d) => d.annotationId),
  );
  const annotations = new Map(
    snapshot.parsedAnnotations
      .filter((annotation) => selected.has(annotation.id))
      .map((annotation) => [annotation.id, annotation]),
  );
  const view = new Map<string, TimelineMessage>();
  for (const message of messages) {
    if (selected.has(message.id)) continue;
    const projected = snapshot.projection.messages.get(message.id);
    if (!projected || projected.presentationDepth === null) {
      view.set(message.id, message);
      continue;
    }
    const annotation = projected.annotationEventId
      ? annotations.get(projected.annotationEventId)
      : null;
    view.set(message.id, {
      ...message,
      canonicalParentId: message.parentId ?? null,
      canonicalRootId: message.rootId ?? null,
      parentId: projected.presentationParentId,
      rootId:
        projected.presentationRootId === message.id
          ? null
          : projected.presentationRootId,
      depth: projected.presentationDepth,
      ...(annotation
        ? {
            threadOrganization: {
              annotationId: annotation.id,
              organizerPubkey: annotation.authorPubkey,
              canonicalParentId: projected.canonicalParentId,
              canonicalRootId: projected.canonicalRootId,
              operation: annotation.operation,
            },
          }
        : {}),
    });
  }
  // A fresh native/optimistic reply can arrive while union refresh is in flight.
  // Follow its native parent into the already-verified presentation map without
  // ever rewriting that reply's canonical fields or including a new annotation.
  const visiting = new Set<string>();
  const resolved = new Set<string>();
  const inherit = (id: string): TimelineMessage | undefined => {
    const message = view.get(id);
    if (!message || resolved.has(id) || visiting.has(id)) return message;
    visiting.add(id);
    if (!snapshot.projection.messages.has(id) && message.parentId) {
      const parent = inherit(message.parentId);
      if (
        parent &&
        parent.depth < 100 &&
        parent.canonicalParentId !== undefined
      ) {
        view.set(id, {
          ...message,
          canonicalParentId: message.parentId,
          canonicalRootId: message.rootId ?? null,
          rootId: parent.rootId ?? parent.id,
          depth: parent.depth + 1,
        });
      }
    }
    visiting.delete(id);
    resolved.add(id);
    return view.get(id);
  };
  return [...view.keys()].map((id) => inherit(id) as TimelineMessage);
}

/** Affected roots use complete derived counts, never native relay counters. */
export function threadLinkRelaySummaries(
  summaries: ReadonlyMap<string, ChannelWindowThreadSummary> | undefined,
  snapshot: ThreadLinkSnapshot | null,
): ReadonlyMap<string, ChannelWindowThreadSummary> | undefined {
  if (
    snapshot?.projection.status !== "complete" ||
    snapshot.projection.heads.size === 0
  )
    return summaries;
  const affected = new Set(snapshot.canonicalRoots);
  for (const entry of snapshot.projection.messages.values())
    if (entry.presentationRootId) affected.add(entry.presentationRootId);
  return new Map(
    [...(summaries ?? [])].filter(([root]) => !affected.has(root)),
  );
}

/** Union signed objects by ID and retain chronological channel order. */
export function mergeThreadLinkEvents(
  ...sources: RelayEvent[][]
): RelayEvent[] {
  return [
    ...new Map(sources.flat().map((event) => [event.id, event])).values(),
  ].sort((a, b) => a.created_at - b.created_at || a.id.localeCompare(b.id));
}

/** Opening a moved subroot still shows its descendants, without other threads. */
export function threadLinkSubtree(
  messages: TimelineMessage[],
  root: string | null,
): TimelineMessage[] {
  if (!root) return [];
  const children = new Map<string, string[]>();
  for (const message of messages) {
    if (!message.parentId) continue;
    const ids = children.get(message.parentId) ?? [];
    ids.push(message.id);
    children.set(message.parentId, ids);
  }
  const included = new Set<string>();
  const queue = [root];
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index];
    if (included.has(id)) continue;
    included.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return messages.filter((message) => included.has(message.id));
}

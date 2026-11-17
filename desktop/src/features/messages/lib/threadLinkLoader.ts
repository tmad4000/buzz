import type {
  RelayEvent,
  ThreadCursor,
  ThreadRepliesResponse,
} from "@/shared/api/types";
import type { RelaySubscriptionFilter } from "@/shared/api/relayClientShared";
import { getThreadReference } from "./threading";
import {
  isThreadLinkCandidate,
  THREAD_LINK_MARKER,
  type ThreadLinkAnnotation,
  type ThreadLinkScope,
} from "./threadLinks";
import type { ThreadLinkProjection } from "./threadLinkProjection";

export const THREAD_LINK_LOAD_LIMITS = {
  annotations: 1000,
  messages: 5000,
  auxiliary: 10000,
  roots: 64,
  page: 200,
  bytes: 32 * 1024 * 1024,
} as const;
const AUX = [5, 7, 9005, 40003];
const ids = (e: RelayEvent, tag: string) =>
  e.tags.filter((t) => t[0] === tag && t[1]).map((t) => t[1]);
const isMessage = (e: RelayEvent) => e.kind === 9 || e.kind === 40002;

export type ThreadLinkSnapshot = {
  events: RelayEvent[];
  annotations: RelayEvent[];
  parsedAnnotations: ThreadLinkAnnotation[];
  canonicalRoots: string[];
  projection: ThreadLinkProjection;
};
export type ThreadLinkLoaderDependencies = {
  fetch: (filter: RelaySubscriptionFilter) => Promise<RelayEvent[]>;
  replies: (
    root: string,
    channel: string,
    cursor: ThreadCursor | null,
  ) => Promise<ThreadRepliesResponse>;
  parse: (
    annotations: RelayEvent[],
    scope: ThreadLinkScope,
  ) => Promise<ThreadLinkAnnotation[]>;
  project: (input: {
    scope: ThreadLinkScope;
    messages: RelayEvent[];
    annotations: RelayEvent[];
    auxiliary: RelayEvent[];
    unavailableEventIds: Set<string>;
  }) => Promise<ThreadLinkProjection>;
  isCurrent: () => boolean;
};

function assertCurrent(deps: ThreadLinkLoaderDependencies) {
  if (!deps.isCurrent())
    throw new DOMException("Thread organization scope changed", "AbortError");
}

/** Pagination must prove completion, including same-second pages. */
export async function fetchThreadLinkPages(
  deps: ThreadLinkLoaderDependencies,
  filter: RelaySubscriptionFilter,
  maximum: number,
): Promise<RelayEvent[]> {
  const result = new Map<string, RelayEvent>();
  const sizes = new Map<string, number>();
  let bytes = 0;
  let cursor: { time: number; id: string } | null = null;
  for (let page = 0; page <= maximum; page++) {
    assertCurrent(deps);
    const rows = await deps.fetch({
      ...filter,
      limit: THREAD_LINK_LOAD_LIMITS.page,
      ...(cursor ? { until: cursor.time, before_id: cursor.id } : {}),
    });
    assertCurrent(deps);
    if (rows.length > THREAD_LINK_LOAD_LIMITS.page)
      throw Error("Thread organization page exceeded its bound");
    for (const event of rows) {
      const size = JSON.stringify(event).length * 2;
      bytes += size - (sizes.get(event.id) ?? 0);
      if (bytes > THREAD_LINK_LOAD_LIMITS.bytes)
        throw Error("Thread organization page byte bound exceeded");
      sizes.set(event.id, size);
      result.set(event.id, event);
    }
    if (result.size > maximum)
      throw Error("Thread organization history exceeded its bound");
    if (rows.length < THREAD_LINK_LOAD_LIMITS.page) return [...result.values()];
    const oldest = [...rows].sort(
      (a, b) => a.created_at - b.created_at || b.id.localeCompare(a.id),
    )[0];
    const next = { time: oldest.created_at, id: oldest.id };
    if (
      cursor &&
      (next.time > cursor.time ||
        (next.time === cursor.time && next.id <= cursor.id))
    ) {
      throw Error("Thread organization pagination did not advance");
    }
    cursor = next;
  }
  throw Error("Thread organization pagination incomplete");
}

function inChannel(event: RelayEvent, channel: string) {
  const tags = ids(event, "h");
  return tags.length === 1 && tags[0] === channel;
}

async function parallel<T>(values: T[], action: (value: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, values.length) }, async () => {
      while (next < values.length) await action(values[next++]);
    }),
  );
}

/** Fetch only linked canonical subthreads; raw signed objects never change. */
export async function loadThreadLinkSnapshot(
  scope: ThreadLinkScope,
  deps: ThreadLinkLoaderDependencies,
): Promise<ThreadLinkSnapshot> {
  // Count IDs once across roots/overlays; keep worker clones bounded in bytes
  // as well as event counts. This state dies with the mounted scope/request.
  const costs = new Map<string, number>();
  let bytes = 0;
  const account = (event: RelayEvent) => {
    const cost = JSON.stringify(event).length * 2;
    bytes += cost - (costs.get(event.id) ?? 0);
    costs.set(event.id, cost);
    if (bytes > THREAD_LINK_LOAD_LIMITS.bytes)
      throw Error("Thread organization byte bound exceeded");
  };
  const annotations = await fetchThreadLinkPages(
    deps,
    {
      kinds: [9],
      "#h": [scope.channelId],
      "#t": [THREAD_LINK_MARKER],
      limit: 200,
    },
    THREAD_LINK_LOAD_LIMITS.annotations,
  );
  for (const event of annotations) account(event);
  if (
    annotations.some(
      (e) => !inChannel(e, scope.channelId) || !isThreadLinkCandidate(e),
    )
  )
    throw Error("Thread annotation query escaped its scope");
  const parsed = await deps.parse(annotations, scope);
  assertCurrent(deps);
  const wanted = new Set(
    parsed.flatMap((a) => [a.childId, ...(a.parentId ? [a.parentId] : [])]),
  );
  const messages = new Map<string, RelayEvent>();
  const unavailable = new Set<string>();
  for (let depth = 0; wanted.size; depth++) {
    if (depth > 100) throw Error("Thread organization ancestor depth exceeded");
    const missing = [...wanted].filter(
      (id) => !messages.has(id) && !unavailable.has(id),
    );
    wanted.clear();
    const chunks = Array.from(
      { length: Math.ceil(missing.length / 50) },
      (_, i) => missing.slice(i * 50, i * 50 + 50),
    );
    await parallel(chunks, async (chunk) => {
      assertCurrent(deps);
      const rows = await deps.fetch({
        kinds: [9, 40002],
        ids: chunk,
        "#h": [scope.channelId],
        limit: 50,
      });
      assertCurrent(deps);
      if (
        rows.some(
          (e) =>
            !chunk.includes(e.id) ||
            !inChannel(e, scope.channelId) ||
            !isMessage(e),
        )
      )
        throw Error("Thread reference query escaped its scope");
      const found = new Set<string>();
      for (const event of rows) {
        account(event);
        found.add(event.id);
        if (isThreadLinkCandidate(event)) {
          unavailable.add(event.id);
          continue;
        }
        messages.set(event.id, event);
        const ref = getThreadReference(event.tags);
        if (ref.parentId && !messages.has(ref.parentId))
          wanted.add(ref.parentId);
        if (ref.rootId && !messages.has(ref.rootId)) wanted.add(ref.rootId);
      }
      // Successful scope-fenced exact-ID reads prove absence; timeouts do not.
      for (const id of chunk) if (!found.has(id)) unavailable.add(id);
    });
    if (messages.size > THREAD_LINK_LOAD_LIMITS.messages)
      throw Error("Thread organization message bound exceeded");
  }
  const roots = [
    ...new Set(
      [...messages.values()].map(
        (e) => getThreadReference(e.tags).rootId ?? e.id,
      ),
    ),
  ];
  if (roots.length > THREAD_LINK_LOAD_LIMITS.roots)
    throw Error("Too many linked threads to load safely");
  const events = new Map(messages);
  await parallel(roots, async (root) => {
    let cursor: ThreadCursor | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 1000; page++) {
      assertCurrent(deps);
      const response = await deps.replies(root, scope.channelId, cursor);
      assertCurrent(deps);
      for (const event of response.events) {
        account(event);
        if (isMessage(event) && !inChannel(event, scope.channelId))
          throw Error("Thread replies escaped channel scope");
        events.set(event.id, event);
      }
      if (
        events.size >
        THREAD_LINK_LOAD_LIMITS.messages + THREAD_LINK_LOAD_LIMITS.auxiliary
      )
        throw Error("Thread organization event bound exceeded");
      if (!response.nextCursor) return;
      if (
        cursor &&
        (response.nextCursor.createdAt < cursor.createdAt ||
          (response.nextCursor.createdAt === cursor.createdAt &&
            response.nextCursor.eventId <= cursor.eventId))
      )
        throw Error("Thread reply cursor moved backward");
      const key = JSON.stringify(response.nextCursor);
      if (seen.has(key)) throw Error("Thread reply pagination did not advance");
      seen.add(key);
      cursor = response.nextCursor;
    }
    throw Error("Thread reply pagination incomplete");
  });
  const contentIds = [...events.values()].filter(isMessage).map((e) => e.id);
  if (contentIds.length > THREAD_LINK_LOAD_LIMITS.messages)
    throw Error("Thread organization message bound exceeded");
  // Root aux is not part of the canonical replies endpoint. Fetch all overlays
  // by signed target, then deletions of overlays, so old edits never resurrect.
  const fetchAux = async (targets: string[], kinds: number[]) => {
    const chunks = Array.from(
      { length: Math.ceil(targets.length / 50) },
      (_, i) => targets.slice(i * 50, i * 50 + 50),
    );
    await parallel(chunks, async (chunk) => {
      const rows = await fetchThreadLinkPages(
        deps,
        { kinds, "#e": chunk, limit: 200 },
        THREAD_LINK_LOAD_LIMITS.auxiliary,
      );
      for (const event of rows) {
        account(event);
        if (
          !kinds.includes(event.kind) ||
          !ids(event, "e").some((id) => chunk.includes(id)) ||
          (ids(event, "h").length && !inChannel(event, scope.channelId))
        )
          throw Error("Thread overlays escaped target scope");
        events.set(event.id, event);
      }
      if (
        events.size >
        THREAD_LINK_LOAD_LIMITS.messages + THREAD_LINK_LOAD_LIMITS.auxiliary
      )
        throw Error("Thread organization overlay bound exceeded");
    });
  };
  await fetchAux(contentIds, AUX);
  await fetchAux(
    [...events.values()].filter((e) => AUX.includes(e.kind)).map((e) => e.id),
    [5, 9005],
  );
  const originals = [...events.values()]
    .filter(isMessage)
    .filter((e) => !isThreadLinkCandidate(e));
  const auxiliary = [...events.values()].filter((e) => !isMessage(e));
  const projection = await deps.project({
    scope,
    messages: originals,
    annotations,
    auxiliary,
    unavailableEventIds: unavailable,
  });
  assertCurrent(deps);
  return {
    events: [...events.values(), ...annotations],
    annotations,
    parsedAnnotations: parsed,
    canonicalRoots: roots,
    projection,
  };
}

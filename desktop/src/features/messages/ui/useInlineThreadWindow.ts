import { isQueryDeadlineError } from "@/shared/lib/relayError";
import { CHANNEL_TIMELINE_CONTENT_KINDS } from "@/shared/constants/kinds";
import * as React from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { getThreadReplies } from "@/shared/api/tauri";
import type { RelayEvent, ThreadCursor } from "@/shared/api/types";
import { boundedInlineThreadRead } from "../lib/inlineThreadFetch";
const CHANNEL_TIMELINE_KINDS = new Set<number>(CHANNEL_TIMELINE_CONTENT_KINDS);
/** A separate bounded cache; never reinterpret the focused panel's array cache. */
export function useInlineThreadWindow(
  channelId: string,
  rootId: string,
  enabled: boolean,
  identityScope: string,
  summaryVersion: string,
  expectedCount: number,
) {
  const client = useQueryClient();
  const queryKey = React.useMemo(
    () => ["inline-thread-window", channelId, rootId, identityScope] as const,
    [channelId, rootId, identityScope],
  );
  const attempts = React.useRef({ version: summaryVersion, count: 0 });
  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: null as ThreadCursor | null,
    queryFn: async ({ pageParam, signal }) => {
      if (attempts.current.version !== summaryVersion)
        attempts.current = { version: summaryVersion, count: 0 };
      const attempt = ++attempts.current.count;
      const page = await boundedInlineThreadRead(
        () =>
          getThreadReplies(rootId, channelId, { limit: 20, cursor: pageParam }),
        signal,
      );
      const bodies = new Set(
        page.events
          .filter((event) => CHANNEL_TIMELINE_KINDS.has(event.kind))
          .map((event) => event.id),
      ).size;
      // Live summary/body replication can arrive out of order. Retry briefly,
      // then retain any available rows with an honest missing-range state.
      if (
        pageParam === null &&
        !page.nextCursor &&
        bodies < Math.min(expectedCount, 20) &&
        attempt < 3
      )
        throw new Error("Replies are still becoming available");
      return page;
    },
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    retry: (failureCount, error) =>
      failureCount < 2 && !isQueryDeadlineError(error),
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 3000),
    gcTime: 5 * 60 * 1000,
  });
  const dirty = React.useRef(false);
  const [revision, repaint] = React.useReducer((n) => n + 1, 0);
  const previousSummary = React.useRef(summaryVersion);
  React.useEffect(() => {
    if (previousSummary.current !== summaryVersion) {
      previousSummary.current = summaryVersion;
      dirty.current = true;
      repaint();
    }
  }, [summaryVersion]);
  const loadedIds = React.useRef(new Set<string>());
  React.useLayoutEffect(() => {
    loadedIds.current = new Set(
      query.data?.pages.flatMap((page) =>
        page.events.map((event) => event.id),
      ) ?? [],
    );
  }, [query.data]);
  React.useEffect(() => {
    if (!enabled) {
      const cached = client.getQueryCache().find({ queryKey, exact: true });
      if (cached && !cached.isActive())
        void client.cancelQueries({ queryKey, exact: true });
      return;
    }
    const channelKey = ["channel-messages", channelId];
    let previous = new Map(
      (client.getQueryData<RelayEvent[]>(channelKey) ?? []).map((event) => [
        event.id,
        event,
      ]),
    );
    return client.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const key = event.query.queryKey;
      if (key[1] !== channelId) return;
      let relevant = key[0] === "thread-replies" && key[2] === rootId;
      if (key[0] === "channel-messages" && Array.isArray(event.action.data)) {
        const events = event.action.data as RelayEvent[];
        relevant = events.some(
          (message) =>
            previous.get(message.id) !== message &&
            message.tags.some(
              (tag) =>
                tag[0] === "e" &&
                (tag[1] === rootId || loadedIds.current.has(tag[1])),
            ),
        );
        previous = new Map(events.map((message) => [message.id, message]));
      }
      if (relevant) {
        dirty.current = true;
        repaint();
      }
    });
  }, [client, enabled, channelId, rootId, queryKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision signals relevant cache writes while fetchStatus remains idle.
  React.useEffect(() => {
    if (!enabled || query.fetchStatus !== "idle" || !dirty.current) return;
    dirty.current = false;
    void query.refetch();
  }, [enabled, query.fetchStatus, query.refetch, revision]);
  return query;
}

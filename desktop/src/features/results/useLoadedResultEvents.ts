import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useSyncExternalStore } from "react";
import type { RelayEvent } from "@/shared/api/types";

const EMPTY: RelayEvent[][] = [];

/** Observe existing scoped caches without requesting any thread history. */
export function useLoadedResultEvents(
  channelId: string | null,
  reader?: string,
) {
  const cache = useQueryClient().getQueryCache();
  const store = useMemo(() => {
    const isScoped = (key: readonly unknown[]) =>
      channelId !== null &&
      key[1] === channelId &&
      (key[0] === "thread-replies" ||
        (key[0] === "unseen-reply-evidence" && key[2] === reader));
    let snapshot = EMPTY;
    return {
      subscribe: (notify: () => void) =>
        cache.subscribe(({ query, type }) => {
          if (
            (type === "added" || type === "removed" || type === "updated") &&
            isScoped(query.queryKey)
          )
            notify();
        }),
      getSnapshot: () => {
        if (!channelId) return EMPTY;
        const next = cache
          .findAll({ predicate: (query) => isScoped(query.queryKey) })
          .map((query) => query.state.data)
          .filter(
            (data): data is RelayEvent[] =>
              Array.isArray(data) && data.length > 0,
          );
        if (
          next.length !== snapshot.length ||
          next.some((data, index) => data !== snapshot[index])
        ) {
          snapshot = next;
        }
        return snapshot;
      },
    };
  }, [cache, channelId, reader]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => EMPTY);
}

import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { searchByDate } from "@/features/search/lib/searchByDate";
import type { SearchSort } from "@/features/search/lib/searchSort";
import { fetchRelaySearchSortSupport } from "@/features/search/relaySearchSort";
import { getRelayHttpUrl, searchMessages } from "@/shared/api/tauri";

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const MIN_SCOPED_SEARCH_QUERY_LENGTH = 1;

export function getMinimumSearchQueryLength(channelId?: string | null) {
  return channelId ? MIN_SCOPED_SEARCH_QUERY_LENGTH : MIN_SEARCH_QUERY_LENGTH;
}

/** A failed probe only costs the faster route, so it reads as unsupported. */
async function relaySupportsSearchSort(
  queryClient: QueryClient,
): Promise<boolean> {
  const relayUrl = await getRelayHttpUrl();
  return queryClient.fetchQuery({
    queryKey: ["relay-search-sort", relayUrl],
    // Cached either way, so an unreadable relay is not probed every search.
    queryFn: () => fetchRelaySearchSortSupport(relayUrl).catch(() => false),
    staleTime: 5 * 60 * 1_000,
  });
}

export function useSearchMessagesQuery(
  query: string,
  options?: {
    channelId?: string;
    authors?: string[];
    since?: number | null;
    until?: number | null;
    enabled?: boolean;
    limit?: number;
    sort?: SearchSort;
    unresolvedOperator?: boolean;
    minimumQueryLength?: number;
  },
) {
  const queryClient = useQueryClient();
  const trimmedQuery = query.trim();
  const enabled = options?.enabled ?? true;
  const limit = options?.limit ?? 12;
  const sort = options?.sort ?? "relevance";
  const channelId = options?.channelId;
  const authors = options?.authors;
  const since = options?.since ?? null;
  const until = options?.until ?? null;
  const unresolvedOperator = options?.unresolvedOperator ?? false;
  const minimumQueryLength =
    options?.minimumQueryLength ?? getMinimumSearchQueryLength(channelId);

  return useQuery({
    queryKey: [
      "search-messages",
      trimmedQuery,
      limit,
      channelId ?? null,
      authors ?? null,
      since,
      until,
      unresolvedOperator,
      sort,
    ],
    queryFn: async ({ signal }) => {
      const input = { q: trimmedQuery, channelId, authors };
      if (sort === "relevance") {
        const { hits } = await searchMessages({
          ...input,
          limit,
          since: since ?? undefined,
          until: until ?? undefined,
        });
        return { hits, exact: true, hasMore: hits.length >= limit };
      }

      const nativeNewest =
        sort === "newest" && (await relaySupportsSearchSort(queryClient));
      return searchByDate({
        order: sort,
        limit,
        since,
        until,
        nativeNewest,
        fetchPage: async (page) => {
          // A superseded search must not keep querying the relay.
          signal.throwIfAborted();
          const { hits } = await searchMessages({
            ...input,
            limit: page.limit,
            since: page.since ?? undefined,
            until: page.until ?? undefined,
            sort: page.sort,
          });
          return hits;
        },
      });
    },
    // Only "show more" keeps the old rows: same search, larger limit.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      const sameSearch =
        key !== undefined &&
        JSON.stringify([key[1], ...key.slice(3)]) ===
          JSON.stringify([
            trimmedQuery,
            channelId ?? null,
            authors ?? null,
            since,
            until,
            unresolvedOperator,
            sort,
          ]);
      return sameSearch ? previous : undefined;
    },
    // Call sites own the "when to search" floor (FTS length / unresolved
    // operators). Keep a single threshold here so it cannot drift.
    enabled: enabled && trimmedQuery.length >= minimumQueryLength,
    staleTime: 30_000,
    gcTime: 5 * 60 * 1_000,
  });
}

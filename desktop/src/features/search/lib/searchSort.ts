export const SEARCH_SORTS = ["relevance", "newest", "oldest"] as const;

/** How message results are ordered. Relevance is the relay's default. */
export type SearchSort = (typeof SEARCH_SORTS)[number];

export const SEARCH_SORT_STORAGE_KEY = "buzz.search.sort";

export const SEARCH_SORT_LABELS: Record<SearchSort, string> = {
  relevance: "Relevance",
  newest: "Newest",
  oldest: "Oldest",
};

/** Parse a stored sort, falling back to relevance. */
export function parseSearchSort(value: string | null | undefined): SearchSort {
  return SEARCH_SORTS.find((sort) => sort === value) ?? "relevance";
}

/** The device's remembered sort. */
export function readSearchSort(): SearchSort {
  try {
    return parseSearchSort(
      globalThis.localStorage?.getItem(SEARCH_SORT_STORAGE_KEY),
    );
  } catch {
    return "relevance";
  }
}

/** Remember `sort` on this device. Best-effort: storage may be unavailable. */
export function writeSearchSort(sort: SearchSort): void {
  try {
    globalThis.localStorage?.setItem(SEARCH_SORT_STORAGE_KEY, sort);
  } catch {
    // The in-memory choice still applies for this session.
  }
}

/** Heading for the messages section; never claims an order we did not prove. */
export function messageSectionTitle(sort: SearchSort, exact: boolean): string {
  if (sort === "relevance") return "Most relevant";
  if (sort === "newest") {
    return exact ? "Newest first" : "Newest of the top matches";
  }
  return exact ? "Oldest first" : "Oldest of the top matches";
}

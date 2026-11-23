import type { SearchHit } from "@/shared/api/searchTypes";

/** The relay clamps a search page to 500 (`PER_PAGE_MAX` in buzz-search). */
const RELAY_PAGE_MAX = 500;
const MIN_SAMPLE = 200;
/** Bounds the work one search can cause on the relay. */
const MAX_REQUESTS = 16;

export type DateOrder = "newest" | "oldest";

export type SearchPageRequest = {
  limit: number;
  since: number | null;
  until: number | null;
  /** Relay-side ordering. Only sent when the relay advertises it. */
  sort?: "newest";
};

export type SearchByDateResult = {
  hits: SearchHit[];
  /** True when `hits` are provably the first matches in this order. */
  exact: boolean;
  hasMore: boolean;
};

/** Deterministic order; ties match the relay's `created_at DESC, id`. */
export function compareByDate(order: DateOrder) {
  return (a: SearchHit, b: SearchHit): number => {
    const byDate =
      order === "newest"
        ? b.createdAt - a.createdAt
        : a.createdAt - b.createdAt;
    if (byDate !== 0) return byDate;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  };
}

/**
 * Find the first `limit` matches by date.
 *
 * A relay search page is the top matches by *relevance*, so sorting one page by
 * date is not "the newest matches". Two exact routes exist:
 *
 * 1. `nativeNewest`: the relay orders by date itself (`buzz-search-sort`).
 * 2. Narrowing. A page shorter than requested holds every match in its window.
 *    A full page is only a sample, but the date of its `limit`-th hit in this
 *    order is a proven bound: at least `limit` matches lie within it. Re-query
 *    inside the bound (inclusive, so same-second ties stay in), galloping past
 *    the sample and halving when it barely tightens the bound, until every match up to the
 *    `limit`-th is known.
 *
 * If narrowing stalls or runs out of requests the result is `exact: false` and
 * must be labelled as a sort of the top matches only.
 */
export async function searchByDate({
  fetchPage,
  limit,
  nativeNewest = false,
  order,
  since,
  until,
}: {
  fetchPage: (request: SearchPageRequest) => Promise<SearchHit[]>;
  limit: number;
  nativeNewest?: boolean;
  order: DateOrder;
  since: number | null;
  until: number | null;
}): Promise<SearchByDateResult> {
  const compare = compareByDate(order);

  if (order === "newest" && nativeNewest) {
    // One extra row answers "is there more?".
    const hits = await fetchPage({
      limit: Math.min(limit + 1, RELAY_PAGE_MAX),
      since,
      until,
      sort: "newest",
    });
    const descending = hits.every(
      (hit, index) => index === 0 || hit.createdAt <= hits[index - 1].createdAt,
    );
    // A relay that stopped honouring the sort falls through to narrowing.
    if (descending) {
      return {
        hits: hits.slice(0, limit),
        exact: true,
        hasMore: hits.length > limit,
      };
    }
  }

  const sampleSize = Math.min(RELAY_PAGE_MAX, Math.max(MIN_SAMPLE, limit * 5));
  const seen = new Map<string, SearchHit>();
  const midpoint = (near: number, far: number) =>
    Math.max(near + Math.floor((far - near) / 2), near + 1);
  const ordered = () => [...seen.values()].sort(compare);

  // `t` runs away from the wanted end: smaller is earlier in the result.
  const sign = order === "newest" ? -1 : 1;
  const toT = (seconds: number | null) =>
    seconds === null ? null : sign * seconds;
  const start = toT(order === "newest" ? until : since);
  const end = toT(order === "newest" ? since : until);

  /** Every match with `t <= known` has been seen; null before any proof. */
  let known = start === null ? null : start - 1;
  /** The wanted matches are proven to have `t <= bound`. */
  let bound = end;
  let target = end;
  let lastFull: number | null = null;
  let step = 0;

  for (let request = 0; request < MAX_REQUESTS; request += 1) {
    const first = known === null ? null : sign * (known + 1);
    const last = target === null ? null : sign * target;
    const page = await fetchPage({
      limit: sampleSize,
      since: order === "newest" ? last : first,
      until: order === "newest" ? first : last,
    });
    for (const hit of page) seen.set(hit.eventId, hit);
    const sorted = ordered();

    if (page.length < sampleSize) {
      // Re-querying the bound covers the rest, so both cases below terminate.
      if (target === end || target === bound) {
        return {
          hits: sorted.slice(0, limit),
          exact: true,
          hasMore: bound !== end || sorted.length > limit,
        };
      }
      known = target;
      const nth = sorted[limit - 1];
      if (nth && known !== null && sign * nth.createdAt <= known) {
        return { hits: sorted.slice(0, limit), exact: true, hasMore: true };
      }
      if (known === null || bound === null) break; // Unreachable; narrows types.
      const tightened =
        lastFull === null || (bound - known) * 2 <= lastFull - known;
      target = tightened ? bound : midpoint(known, bound);
      continue;
    }

    const near: number = known ?? sign * sorted[0].createdAt;
    const far: number = target ?? sign * sorted[sorted.length - 1].createdAt;
    const nthT = sign * sorted[limit - 1].createdAt;
    bound = Math.min(nthT, far);
    lastFull = target;
    let next: number;
    if (known === null) {
      // A sample says nothing about what lies beyond it, so reach past it,
      // further each time, until a window proves the near edge. No message
      // predates the epoch, and the relay rejects negative times.
      step = Math.max(step * 4, far - near, 1);
      next = Math.min(near - step, bound);
      if (order === "oldest") next = Math.max(next, 0);
    } else if ((bound - known) * 2 <= far - known) {
      next = bound;
    } else {
      next = midpoint(near, bound);
    }
    // No progress: one second holds more matches than a page can.
    if (target !== null && next >= target) break;
    target = next;
  }

  return { hits: ordered().slice(0, limit), exact: false, hasMore: true };
}

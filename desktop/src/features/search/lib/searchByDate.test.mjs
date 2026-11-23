import assert from "node:assert/strict";
import test from "node:test";

import { compareByDate, searchByDate } from "./searchByDate.ts";

const hit = (id, createdAt, rank = 0) => ({
  eventId: String(id).padStart(6, "0"),
  createdAt,
  rank,
});

/** The relay's contract: filter by window, rank, then truncate (query.rs). */
function relay(corpus, { supportsSort = false, pageMax = 500 } = {}) {
  const requests = [];
  return {
    requests,
    fetchPage: async (request) => {
      requests.push(request);
      const { limit, since, until, sort } = request;
      return corpus
        .filter((h) => since === null || h.createdAt >= since)
        .filter((h) => until === null || h.createdAt <= until)
        .sort(
          (a, b) =>
            (supportsSort && sort === "newest" ? 0 : b.rank - a.rank) ||
            compareByDate("newest")(a, b),
        )
        .slice(0, Math.min(limit, pageMax));
    },
  };
}

const truth = (corpus, order, limit, since = null, until = null) =>
  corpus
    .filter((h) => since === null || h.createdAt >= since)
    .filter((h) => until === null || h.createdAt <= until)
    .sort(compareByDate(order))
    .slice(0, limit);

const ids = (hits) => hits.map((h) => h.eventId);

const run = (server, options) =>
  searchByDate({
    fetchPage: server.fetchPage,
    limit: 40,
    since: null,
    until: null,
    ...options,
  });

/** Deterministic PRNG so a failure is reproducible. */
function rng(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

test("the newest match ranks last, beyond the relevance page", async () => {
  // Old messages all outrank the new one: sorting one page by date misses it.
  const corpus = [
    ...Array.from({ length: 900 }, (_, i) => hit(i, 1_000 + i, 5)),
    hit(9999, 9_000_000, 0),
  ];
  const server = relay(corpus);
  const firstPage = await server.fetchPage({
    limit: 200,
    since: null,
    until: null,
  });
  assert.equal(ids(firstPage).includes("009999"), false);

  const result = await run(server, { order: "newest" });
  assert.equal(result.exact, true);
  assert.equal(result.hits[0].eventId, "009999");
  assert.deepEqual(ids(result.hits), ids(truth(corpus, "newest", 40)));
});

for (const [name, rank] of [
  ["ties broken newest-first", () => 0],
  ["rank favouring old messages", (i) => -i],
  ["rank favouring new messages", (i) => i],
  ["random rank", (_, random) => Math.floor(random() * 5)],
]) {
  for (const order of ["newest", "oldest"]) {
    test(`exact ${order} across thousands of matches: ${name}`, async () => {
      const random = rng(7);
      const corpus = Array.from({ length: 8_000 }, (_, i) =>
        hit(
          i,
          1_700_000_000 + i * 600 + Math.floor(random() * 500),
          rank(i, random),
        ),
      );
      const server = relay(corpus);
      const result = await run(server, { order });
      assert.equal(result.exact, true);
      assert.equal(result.hasMore, true);
      assert.deepEqual(ids(result.hits), ids(truth(corpus, order, 40)));
      assert.ok(server.requests.length <= 16);
    });
  }
}

test("randomised corpora never claim a wrong exact order", async () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const random = rng(seed);
    const size = Math.floor(random() * 1_500);
    const span = 1 + Math.floor(random() * 5_000);
    const corpus = Array.from({ length: size }, (_, i) =>
      // Clustered and colliding seconds.
      hit(
        i,
        10_000 + Math.floor(random() ** 3 * span),
        Math.floor(random() * 4),
      ),
    );
    const since = random() < 0.3 ? 10_000 + Math.floor(span / 4) : null;
    const until = random() < 0.3 ? 10_000 + Math.floor(span / 2) : null;
    for (const order of ["newest", "oldest"]) {
      const result = await run(relay(corpus), { order, since, until });
      const expected = truth(corpus, order, 41, since, until);
      if (result.exact) {
        assert.deepEqual(
          ids(result.hits),
          ids(expected.slice(0, 40)),
          `seed ${seed} ${order}`,
        );
        assert.equal(result.hasMore, expected.length > 40, `seed ${seed}`);
      }
    }
  }
});

for (const count of [39, 40, 41, 199, 200, 201, 500, 501]) {
  for (const order of ["newest", "oldest"]) {
    test(`page boundary: ${count} matches, ${order}`, async () => {
      const corpus = Array.from({ length: count }, (_, i) =>
        hit(i, 5_000 + i, count - i),
      );
      const result = await run(relay(corpus), { order });
      assert.equal(result.exact, true);
      assert.deepEqual(ids(result.hits), ids(truth(corpus, order, 40)));
      assert.equal(result.hasMore, count > 40);
    });
  }
}

test("same-second ties at the bound are kept and ordered by id", async () => {
  const corpus = [
    ...Array.from({ length: 30 }, (_, i) => hit(i, 2_000, 1)),
    ...Array.from({ length: 30 }, (_, i) => hit(100 + i, 1_900, 1)),
    ...Array.from({ length: 600 }, (_, i) => hit(1_000 + i, 1_000 + i, 9)),
  ];
  const result = await run(relay(corpus), { order: "newest" });
  assert.equal(result.exact, true);
  assert.deepEqual(ids(result.hits), ids(truth(corpus, "newest", 40)));
});

test("more matches in one second than a page holds is not called exact", async () => {
  const corpus = Array.from({ length: 900 }, (_, i) => hit(i, 2_000, i));
  for (const order of ["newest", "oldest"]) {
    const server = relay(corpus);
    const result = await run(server, { order });
    assert.equal(result.exact, false);
    assert.equal(result.hits.length, 40);
    assert.ok(server.requests.length <= 16);
  }
});

test("caller's date range is never widened", async () => {
  const corpus = Array.from({ length: 2_000 }, (_, i) => hit(i, 1_000 + i, -i));
  for (const order of ["newest", "oldest"]) {
    const server = relay(corpus);
    await run(server, { order, since: 1_200, until: 2_400 });
    for (const { since, until } of server.requests) {
      assert.ok(since >= 1_200 && until <= 2_400, `${since}..${until}`);
    }
  }
});

test("relay-side newest is one exact request", async () => {
  const corpus = Array.from({ length: 900 }, (_, i) => hit(i, 1_000 + i, -i));
  const server = relay(corpus, { supportsSort: true });
  const result = await run(server, { order: "newest", nativeNewest: true });
  assert.deepEqual(server.requests, [
    { limit: 41, since: null, until: null, sort: "newest" },
  ]);
  assert.equal(result.exact, true);
  assert.equal(result.hasMore, true);
  assert.deepEqual(ids(result.hits), ids(truth(corpus, "newest", 40)));
});

test("a relay that ignores the advertised sort is caught", async () => {
  const corpus = Array.from({ length: 900 }, (_, i) => hit(i, 1_000 + i, -i));
  const result = await run(relay(corpus), {
    order: "newest",
    nativeNewest: true,
  });
  assert.equal(result.exact, true);
  assert.deepEqual(ids(result.hits), ids(truth(corpus, "newest", 40)));
});

test("oldest never uses the relay's newest sort", async () => {
  const corpus = Array.from({ length: 50 }, (_, i) => hit(i, 1_000 + i));
  const server = relay(corpus, { supportsSort: true });
  await run(server, { order: "oldest", nativeNewest: true });
  assert.equal(
    server.requests.some((request) => request.sort),
    false,
  );
});

test("a failing page propagates instead of reading as complete", async () => {
  let calls = 0;
  const corpus = Array.from({ length: 900 }, (_, i) => hit(i, 1_000 + i));
  const server = relay(corpus);
  await assert.rejects(
    run(
      {
        fetchPage: async (request) => {
          calls += 1;
          if (calls === 2) throw new Error("relay down");
          return server.fetchPage(request);
        },
      },
      { order: "oldest" },
    ),
    /relay down/,
  );
});

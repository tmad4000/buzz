import assert from "node:assert/strict";
import { test } from "node:test";
import { rankThreadDestinations } from "./threadRouting.ts";
const entry = (id, body, createdAt = 100, extra = {}) => ({
  message: {
    id,
    body,
    createdAt,
    author: "Nora",
    depth: 0,
    time: "now",
    kind: 9,
    ...extra,
  },
  summary: null,
});
test("keyword beats recency, participant breaks ties, newest falls back deterministically", () => {
  const entries = [
    entry("recent", "Lunch", 1000),
    entry("match", "Signed release rollback", 100),
    entry("participant", "Other work", 500, { author: "Jacob" }),
  ];
  assert.equal(
    rankThreadDestinations(entries, "release rollback", 1000)[0].id,
    "match",
  );
  assert.equal(
    rankThreadDestinations(entries, "@Jacob update", 1000)[0].id,
    "participant",
  );
  assert.equal(rankThreadDestinations(entries, "", 1000)[0].id, "recent");
});
test("only committed conversation roots, top three, including V2 and first replies", () => {
  const entries = [
    entry("system", "release", 1, { kind: 40099 }),
    entry("reply", "release", 1, { parentId: "root" }),
    entry("pending", "release", 1, { pending: true }),
    entry("v2", "release", 5, { kind: 40002 }),
    entry("first", "release", 4),
    entry("third", "release", 3),
    entry("fourth", "release", 2),
  ];
  assert.deepEqual(
    rankThreadDestinations(entries, "release", 10).map((x) => x.id),
    ["v2", "first", "third"],
  );
});
test("summary participant and reply recency contribute without treating scores as confidence", () => {
  const entries = [
    entry("a", "Other", 1),
    {
      ...entry("b", "Other", 1),
      summary: {
        participants: [{ author: "Jacob" }],
        lastReplyAt: 1000,
        replyCount: 7,
      },
    },
  ];
  const result = rankThreadDestinations(entries, "Jacob", 1000);
  assert.equal(result[0].id, "b");
  assert.equal(result[0].replyCount, 7);
  assert.equal(result[0].reason, "Participant mentioned in draft");
});

test("nested ranking admits only proved descendants, including deep replies, and keeps main ranking unchanged", () => {
  const entries = [
    entry("root", "Other topic"),
    entry("child", "Release", 900, { parentId: "root" }),
    entry("deep", "Release rollback", 500, { parentId: "child" }),
    entry("sibling", "Release rollback exact", 1000, {
      parentId: "elsewhere",
      rootId: "root",
    }),
    entry("orphan", "Release rollback", 1000, {
      parentId: "missing",
      rootId: "root",
    }),
    entry("pending-child", "Release rollback", 1000, {
      parentId: "root",
      pending: true,
    }),
    entry("system-child", "Release rollback", 1000, {
      parentId: "root",
      kind: 40099,
    }),
  ];
  assert.deepEqual(
    rankThreadDestinations(entries, "release rollback", 1000, "root").map(
      (x) => x.id,
    ),
    ["deep", "child"],
  );
  assert.deepEqual(
    rankThreadDestinations(entries, "release rollback", 1000).map((x) => x.id),
    ["root"],
  );
  assert.deepEqual(
    rankThreadDestinations(entries, "anything", 1000, "missing-root"),
    [],
  );
});

test("a subthread scope excludes ancestors and sibling branches; cycles terminate", () => {
  const entries = [
    entry("root", "Release"),
    entry("branch", "Release", 1, { parentId: "root" }),
    entry("nested", "Release", 1, { parentId: "branch" }),
    entry("other", "Release", 1, { parentId: "root" }),
    entry("loop-a", "Release", 1, { parentId: "loop-b" }),
    entry("loop-b", "Release", 1, { parentId: "loop-a" }),
  ];
  assert.deepEqual(
    rankThreadDestinations(entries, "release", 10, "branch").map((x) => x.id),
    ["nested"],
  );
  assert.equal(
    rankThreadDestinations(entries, "release", 10, "loop-a").length,
    1,
  );
});

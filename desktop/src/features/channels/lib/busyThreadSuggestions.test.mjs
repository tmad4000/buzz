import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseBusyReplyThreshold,
  selectBusyThreadSuggestions,
} from "./busyThreadSuggestions.ts";
const entry = (id, count, extra = {}) => ({
  message: { id, body: id, createdAt: 1, depth: 0, ...extra },
  summary: count === null ? null : { replyCount: count, lastReplyAt: 999 },
});
test("busy threshold uses existing counts, inclusive boundary, never latest timestamp as velocity", () => {
  const source = [entry("low", 19), entry("busy", 20), entry("unknown", null)];
  assert.deepEqual(
    selectBusyThreadSuggestions(source, [], new Set()).map((x) => x.message.id),
    ["busy"],
  );
  assert.equal(
    selectBusyThreadSuggestions([entry("recent", 1)], [], new Set()).length,
    0,
  );
  assert.equal(parseBusyReplyThreshold("10"), 10);
  assert.equal(parseBusyReplyThreshold(-1), 20);
  assert.equal(parseBusyReplyThreshold(Infinity), 20);
  assert.equal(
    selectBusyThreadSuggestions([entry("tunable", 10)], [], new Set(), 10)
      .length,
    1,
  );
});
test("canonical roots only, pinned/dismissed excluded, deduplicated, bounded and scope supplied by caller", () => {
  const source = [
    entry("busy", 25),
    entry("busy", 25),
    entry("pending", 100, { pending: true }),
    entry("optimistic-x", 100),
    entry("reply", 100, { parentId: "root" }),
    entry("pinned", 100),
    entry("dismissed", 100),
  ];
  assert.deepEqual(
    selectBusyThreadSuggestions(
      source,
      [{ id: "pinned", title: "P" }],
      new Set(["dismissed"]),
    ).map((x) => x.message.id),
    ["busy"],
  );
  assert.equal(
    selectBusyThreadSuggestions(
      Array.from({ length: 10 }, (_, i) => entry(String(i), 20)),
      [],
      new Set(),
    ).length,
    3,
  );
});
test("relay summary supports flat Timeline roots without fetching or storing counts", () => {
  const root = entry("root", null);
  const summary = new Map([
    ["root", { descendantCount: 22, lastReplyAt: 999 }],
    ["unloaded-root", { descendantCount: 99 }],
  ]);
  assert.deepEqual(
    selectBusyThreadSuggestions([root], [], new Set(), 20, summary),
    [{ message: root.message, replyCount: 22 }],
  );
  assert.equal(root.summary, null);
  assert.equal(
    selectBusyThreadSuggestions([entry("invalid", NaN)], [], new Set()).length,
    0,
  );
});

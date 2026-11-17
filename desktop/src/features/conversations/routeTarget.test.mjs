import assert from "node:assert/strict";
import test from "node:test";
import { selectConversationRouteTarget } from "./routeTarget.ts";

const views = [
  { id: "a", channelId: "chat" },
  { id: "b", channelId: "chat" },
  { id: "c", channelId: "dm" },
];
const select = (intent, overrides = {}) =>
  selectConversationRouteTarget({
    views,
    focusedViewId: "c",
    visibleViewIds: new Set(["a", "b", "c"]),
    recentViewIds: ["retired", "b", "a"],
    intent,
    ...overrides,
  });

test("sidebar navigates active view while external links reuse the most recent visible match", () => {
  assert.equal(select({ kind: "sidebar" }), "c");
  assert.equal(select({ kind: "external", channelId: "chat" }), "b");
});

test("focused duplicate wins over recency; unrelated or stale IDs cannot win", () => {
  assert.equal(
    select({ kind: "external", channelId: "chat" }, { focusedViewId: "a" }),
    "a",
  );
  assert.equal(select({ kind: "external", channelId: "other" }), "c");
});

test("compact-hidden matches do not steal external navigation", () => {
  assert.equal(
    select(
      { kind: "external", channelId: "chat" },
      { visibleViewIds: new Set(["c"]) },
    ),
    "c",
  );
});

test("history targets a retained hidden instance, but never resurrects a closed one", () => {
  const compact = { visibleViewIds: new Set(["c"]) };
  assert.equal(select({ kind: "history", viewInstanceId: "a" }, compact), "a");
  assert.equal(select({ kind: "history", viewInstanceId: "closed" }), "c");
  assert.equal(select({ kind: "history", viewInstanceId: null }), "c");
});

test("invalid active identity fails closed without choosing an arbitrary replacement", () => {
  assert.equal(select({ kind: "sidebar" }, { focusedViewId: "retired" }), null);
  assert.equal(
    select({ kind: "external", channelId: "other" }, { views: [] }),
    null,
  );
});

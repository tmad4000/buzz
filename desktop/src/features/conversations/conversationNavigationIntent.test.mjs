import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChannelNavigationState,
  hasSidebarConversationIntent,
} from "./conversationNavigationIntent.ts";

test("sidebar origin is explicit while canonical routing and previous state stay intact", () => {
  const previous = { unrelated: 42, searchHighlight: { activationId: "old" } };
  const state = buildChannelNavigationState(previous, {
    paneNavigationOrigin: "sidebar",
  });
  assert.equal(hasSidebarConversationIntent(state), true);
  assert.equal(state.unrelated, 42);
  assert.equal(state.searchHighlight, null);
  assert.equal(hasSidebarConversationIntent(previous), false);
  assert.deepEqual(previous.searchHighlight, { activationId: "old" });
});

test("subsequent external navigation clears copied sidebar intent even when preserving highlight", () => {
  const highlight = { activationId: "keep" };
  const sidebar = buildChannelNavigationState(
    { searchHighlight: highlight },
    { paneNavigationOrigin: "sidebar", preserveSearchHighlight: true },
  );
  const ordinary = buildChannelNavigationState(sidebar);
  assert.equal(hasSidebarConversationIntent(ordinary), false);
  assert.equal(ordinary.searchHighlight, null);
  const preserved = buildChannelNavigationState(sidebar, {
    preserveSearchHighlight: true,
  });
  assert.equal(hasSidebarConversationIntent(preserved), false);
  assert.equal(preserved.searchHighlight, highlight);
  assert.equal(hasSidebarConversationIntent(sidebar), true);
});

test("unversioned or malformed intent does not change target policy", () => {
  for (const state of [
    null,
    {},
    { buzzConversationIntent: "sidebar" },
    { buzzConversationIntent: { kind: "sidebar" } },
    { buzzConversationIntent: { version: 1, kind: "other" } },
  ])
    assert.equal(hasSidebarConversationIntent(state), false);
});

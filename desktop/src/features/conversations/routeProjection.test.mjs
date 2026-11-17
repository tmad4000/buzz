import assert from "node:assert/strict";
import test from "node:test";
import {
  conversationHistoryViewId,
  conversationRouteProjection,
  conversationPanelStateFromSearch,
  sameConversationPanelRoute,
} from "./routeProjection.ts";

const view = {
  id: "private-view",
  channelId: "canonical-chat",
  panelState: {
    thread: "root",
    profile: null,
    messageId: "reply",
    autoSend: "forbidden-command",
    viewInstanceId: "never-in-url",
  },
};

test("incoming search normalizes absent panels without retaining commands or unknown fields", () => {
  assert.deepEqual(conversationPanelStateFromSearch(view.panelState), {
    messageId: "reply",
    thread: "root",
  });
  assert.equal(
    sameConversationPanelRoute(view.panelState, {
      messageId: "reply",
      thread: "root",
      profile: "",
    }),
    true,
  );
  assert.equal(sameConversationPanelRoute({ thread: "old" }, {}), false);
});

test("projection uses canonical resource/panel IDs and excludes commands and private IDs", () => {
  const projection = conversationRouteProjection(view, "scope", true);
  assert.deepEqual(projection.params, { channelId: "canonical-chat" });
  assert.deepEqual(projection.search, { messageId: "reply", thread: "root" });
  assert.equal(projection.replace, true);
  assert.equal(projection.resetScroll, false);
  assert.equal(JSON.stringify(projection.search).includes(view.id), false);
  assert.deepEqual(view.panelState, {
    thread: "root",
    profile: null,
    messageId: "reply",
    autoSend: "forbidden-command",
    viewInstanceId: "never-in-url",
  });
});

test("history carries initiating view and scope while retaining unrelated router state", () => {
  const projection = conversationRouteProjection(view, "scope", false);
  const previous = { routerKey: "keep", unrelated: 42 };
  const state = projection.state(previous);
  assert.equal(conversationHistoryViewId(state, "scope"), "private-view");
  assert.equal(conversationHistoryViewId(state, "other-scope"), null);
  assert.equal(state.routerKey, "keep");
  assert.equal(state.unrelated, 42);
  assert.deepEqual(previous, { routerKey: "keep", unrelated: 42 });
  assert.equal(projection.replace, false);
});

test("malformed or unversioned metadata is treated as an ordinary external link", () => {
  for (const state of [
    null,
    {},
    { buzzConversationView: "wrong" },
    { buzzConversationView: { scopeKey: "scope", viewInstanceId: "a" } },
    {
      buzzConversationView: {
        version: 1,
        scopeKey: "scope",
        viewInstanceId: "",
      },
    },
    {
      buzzConversationView: {
        version: 1,
        scopeKey: "scope",
        viewInstanceId: "a".repeat(257),
      },
    },
  ])
    assert.equal(conversationHistoryViewId(state, "scope"), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useUnseenThreadReplies } from "./useUnseenThreadReplies.ts";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
test("admitted organized bodies write native exact keys while hidden views write nothing", async () => {
  const old = document.hasFocus;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  document.hasFocus = () => true;
  const node = document.createElement("div");
  document.body.append(node);
  const tree = createRoot(node);
  let latest;
  const writes = [];
  const messages = [
    {
      id: "C",
      rootId: "A",
      parentId: "A",
      canonicalRootId: null,
      createdAt: 10,
      pubkey: "other",
    },
    {
      id: "D",
      rootId: "A",
      parentId: "C",
      canonicalRootId: "C",
      createdAt: 20,
      pubkey: "other",
    },
  ];
  function Probe() {
    latest = useUnseenThreadReplies({
      timelineMessages: messages,
      panelMessages: [],
      currentPubkey: "me",
      getSeenAt: () => null,
      markSeen: (...args) => writes.push(args),
      markRead: () => {},
      readStateVersion: 0,
    });
    return null;
  }
  const render = (focused) =>
    act(() =>
      tree.render(
        React.createElement(
          ConversationViewContext.Provider,
          { value: { viewInstanceId: "one", focused, visible: true } },
          React.createElement(Probe),
        ),
      ),
    );
  try {
    await render(true);
    act(() => latest.markVisibleReplies(messages, "A"));
    assert.deepEqual(writes, [
      ["C", "C", 10],
      ["C", "D", 20],
    ]);
    await render(false);
    act(() => latest.markVisibleReplies(messages, "A"));
    assert.equal(writes.length, 2);
  } finally {
    await act(() => tree.unmount());
    node.remove();
    document.hasFocus = old;
  }
});

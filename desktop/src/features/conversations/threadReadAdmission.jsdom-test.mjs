import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { useChannelUnreadState } from "@/features/channels/ui/useChannelUnreadState";
import { useHuddleReadMarker } from "@/features/channels/ui/useHuddleReadMarker";

const messages = [
  {
    id: "root",
    createdAt: 1,
    body: "root",
    author: "other",
    pubkey: "other",
    depth: 0,
    kind: 9,
    tags: [],
  },
  {
    id: "reply",
    createdAt: 2,
    parentId: "root",
    rootId: "root",
    body: "reply",
    author: "other",
    pubkey: "other",
    depth: 1,
    kind: 9,
    tags: [],
  },
];
const noRead = () => null;
const noop = () => {};
const isNotMuted = () => false;

test("thread mount/reveal/visibility and queued callbacks obey the view focus guard", async () => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.hasFocus = () => true;
  const writes = [];
  const markMessageRead = (...args) => writes.push(args);
  const latest = {};
  const options = {
    activeChannelId: "general",
    timelineMessages: messages,
    currentPubkey: "self",
    openThreadHeadId: "root",
    threadReplyTargetId: null,
    expandedThreadReplyIds: new Set(),
    getChannelReadAt: noRead,
    getMessageReadAt: noRead,
    clearChannelUnreadSource: noop,
    markChannelUnread: noop,
    markMessageRead,
    isThreadMuted: isNotMuted,
    readStateVersion: 0,
  };
  function Host({ id }) {
    latest[id] = useChannelUnreadState(options);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (focused) =>
    act(async () =>
      root.render(
        ["a", "b"].map((id) =>
          React.createElement(
            ConversationViewContext.Provider,
            {
              key: id,
              value: {
                viewInstanceId: id,
                focused: id === focused,
                visible: true,
              },
            },
            React.createElement(Host, { id }),
          ),
        ),
      ),
    );
  try {
    await render(null);
    latest.b.markRevealedRepliesRead("root");
    latest.b.markSidebarRepliesRead([messages[1]]);
    assert.deepEqual(writes, []);
    await render("a");
    assert.deepEqual(
      writes,
      [],
      "focused mount alone is not viewport evidence",
    );
    latest.a.markRevealedRepliesRead("root");
    assert.deepEqual(writes, [], "expansion alone cannot acknowledge replies");
    latest.a.markSidebarRepliesRead([messages[1]]);
    assert.deepEqual(writes, [["reply", 2]]);
    const queued = latest.a.markSidebarRepliesRead;
    writes.length = 0;
    await render(null);
    queued([messages[1]]);
    latest.b.markRevealedRepliesRead("root");
    assert.deepEqual(writes, []);
    // Manual Mark read remains explicit, independent of focus admission.
    await act(async () => latest.b.handleMarkMessageRead("reply"));
    assert.deepEqual(writes, [["reply", 2]]);
  } finally {
    await act(() => root.unmount());
    container.remove();
    delete document.visibilityState;
    delete document.hasFocus;
  }
});

test("huddle mount read effect requires visible focus", async () => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.hasFocus = () => true;
  const writes = [];
  const events = [{ id: "r", created_at: 1, tags: [] }];
  const options = {
    activeChannelId: "huddle",
    activeChannelIsMember: true,
    isHuddleTranscript: true,
    markChannelRead: (...args) => writes.push(args),
    messages: events,
    resolvedMessages: events,
  };
  function Host() {
    useHuddleReadMarker(options);
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  const render = (focused, visible) =>
    act(async () =>
      root.render(
        React.createElement(
          ConversationViewContext.Provider,
          { value: { viewInstanceId: "h", focused, visible } },
          React.createElement(Host),
        ),
      ),
    );
  try {
    await render(false, true);
    await render(true, false);
    assert.deepEqual(writes, []);
    await render(true, true);
    assert.equal(writes.length, 1);
  } finally {
    await act(() => root.unmount());
    delete document.visibilityState;
    delete document.hasFocus;
  }
});

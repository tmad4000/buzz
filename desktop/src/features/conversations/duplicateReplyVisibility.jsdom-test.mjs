import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { useVisibleThreadReplies } from "@/features/messages/ui/useVisibleThreadReplies";
import { useChannelUnreadState } from "@/features/channels/ui/useChannelUnreadState";
import { useUnseenThreadReplies } from "@/features/channels/ui/useUnseenThreadReplies";
import { countUnseenReplyUnion } from "./unseenReplyUnion.ts";

const message = (id, at, reply = true) => ({
  id,
  createdAt: at,
  rootId: reply ? "root" : undefined,
  parentId: reply ? "root" : undefined,
  body: id,
  author: "other",
  pubkey: "other",
  depth: reply ? 1 : 0,
  kind: 9,
  tags: [],
});
const initial = [
  message("root", 1, false),
  message("visible", 2),
  message("offscreen", 3),
];
const noop = () => {};

test("duplicate visibility writes canonical markers once, retains sibling entry anchor/DOM state, and rejects late/collapsed/retired callbacks", async () => {
  const oldObserver = globalThis.IntersectionObserver;
  const oldFocus = document.hasFocus;
  const oldVisibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const observers = [];
  globalThis.IntersectionObserver = class {
    nodes = [];
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      node.getClientRects = () => [{}];
      this.nodes.push(node);
    }
    disconnect() {
      this.retired = true;
    }
  };
  const read = new Map(),
    seen = new Map(),
    writes = [],
    latest = {};
  const getRead = (id) => read.get(id) ?? null;
  const getSeen = (root, id) => seen.get(`${root}:${id}`) ?? null;
  const markRead = (id, at) => {
    read.set(id, at);
    writes.push([id, at]);
  };
  const markSeen = (root, id, at) => seen.set(`${root}:${id}`, at);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function Host({ id, messages, eligible, version }) {
    const ref = React.useRef(null);
    const [disclosure] = React.useState(false);
    const unread = useChannelUnreadState({
      activeChannelId: "channel",
      timelineMessages: messages,
      currentPubkey: "self",
      openThreadHeadId: "root",
      threadReplyTargetId: null,
      expandedThreadReplyIds: new Set(),
      getChannelReadAt: () => null,
      getMessageReadAt: getRead,
      clearChannelUnreadSource: noop,
      markChannelUnread: noop,
      markMessageRead: markRead,
      isThreadMuted: () => false,
      readStateVersion: version,
    });
    const unseen = useUnseenThreadReplies({
      timelineMessages: messages,
      panelMessages: [],
      currentPubkey: "self",
      getSeenAt: getSeen,
      markSeen,
      markRead: unread.markSidebarRepliesRead,
      readStateVersion: version,
    });
    const rows = messages.filter((m) => eligible.includes(m.id));
    useVisibleThreadReplies(
      ref,
      rows,
      unseen.markVisibleReplies,
      "root",
      "community:channel:root",
    );
    latest[id] = { ...unread, ...unseen, disclosure };
    return React.createElement(
      "section",
      { ref, "data-view": id },
      React.createElement("input", {
        "data-selection": id,
        defaultValue: "anchor",
      }),
      ...rows.map((m) =>
        React.createElement(
          "article",
          { key: m.id, "data-testid": "message-row", "data-message-id": m.id },
          React.createElement("div", { "data-testid": "message-body" }, m.id),
        ),
      ),
    );
  }
  let version = 0;
  const render = (
    focused,
    messages = initial,
    eligibleA = ["visible", "offscreen"],
    eligibleB = ["visible", "offscreen"],
  ) =>
    act(() =>
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
            React.createElement(Host, {
              id,
              messages,
              eligible: id === "a" ? eligibleA : eligibleB,
              version: version++,
            }),
          ),
        ),
      ),
    );
  const count = () =>
    countUnseenReplyUnion(
      [latest.a, latest.b].map((value) => ({
        communityId: "community",
        channelId: "channel",
        replies: value.unseenReplies,
      })),
    );
  const observer = (id) =>
    [...observers]
      .reverse()
      .find(
        (o) =>
          !o.retired && o.nodes[0]?.closest("[data-view]").dataset.view === id,
      );
  const emit = (o, ids) =>
    act(() =>
      o.callback(
        o.nodes.map((target) => ({
          target,
          isIntersecting: ids.includes(
            target.closest("[data-message-id]").dataset.messageId,
          ),
        })),
      ),
    );
  try {
    await render("a");
    assert.deepEqual(
      writes,
      [],
      "mount, open and Smart-style committed list are not viewport reads",
    );
    assert.equal(count(), 2, "union, not sum of duplicate views");
    const b = container.querySelector('[data-view="b"]');
    const input = b.querySelector("input");
    input.setSelectionRange(1, 3);
    b.scrollTop = 27;
    const anchor = latest.b.threadFirstUnreadReplyId;
    const firstA = observer("a");
    await emit(firstA, ["visible"]);
    await render("a");
    assert.deepEqual(writes, [["visible", 2]]);
    assert.equal(count(), 1);
    assert.equal(
      latest.b.threadFirstUnreadReplyId,
      anchor,
      "sibling marker advances cannot erase entry anchor",
    );
    assert.equal(latest.b.disclosure, false);
    assert.equal(b.scrollTop, 27);
    assert.equal(input.selectionStart, 1);
    assert.equal(input.selectionEnd, 3);
    const late = [
      ...initial,
      message("late", 4),
      { ...message("pending", 5), pending: true },
    ];
    await render("a", late, ["visible", "offscreen", "late", "pending"]);
    const lateA = observer("a");
    assert.equal(lateA.nodes.length, 3, "pending reply body is ineligible");
    assert.equal(writes.length, 1, "late arrival alone cannot read");
    await render("a", late, []);
    await emit(lateA, ["late"]);
    assert.equal(
      writes.length,
      1,
      "collapsed/retired queued callbacks cannot read",
    );
    await render("b", late, ["visible", "offscreen", "late"], ["late"]);
    await emit(firstA, ["offscreen"]);
    const activeB = observer("b");
    b.setAttribute("inert", "");
    await emit(activeB, ["late"]);
    assert.equal(
      writes.length,
      1,
      "covered bodies cannot read despite a queued intersecting entry",
    );
    b.removeAttribute("inert");
    await emit(activeB, ["late"]);
    await render("b", late, ["visible", "offscreen", "late"], ["late"]);
    assert.deepEqual(
      writes,
      [
        ["visible", 2],
        ["late", 4],
      ],
      "only B's visible committed body writes after focus",
    );
    assert.equal(count(), 1, "offscreen remains unseen, pending excluded");
    await act(() => root.unmount());
    await emit(activeB, ["late"]);
    assert.equal(writes.length, 2);
  } finally {
    await act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = oldObserver;
    document.hasFocus = oldFocus;
    if (oldVisibility)
      Object.defineProperty(document, "visibilityState", oldVisibility);
    else delete document.visibilityState;
  }
});

test("workspace union includes canonical community/channel/root identities", () => {
  const replies = new Map([["root", [{ id: "reply" }, { id: "reply" }]]]);
  assert.equal(
    countUnseenReplyUnion([
      { communityId: "c", channelId: "one", replies },
      { communityId: "c", channelId: "one", replies },
      { communityId: "c", channelId: "two", replies },
      { communityId: "other", channelId: "one", replies },
    ]),
    3,
  );
});

test("reusing a hook instance for a new view resets only its local observer visit and rejects retired callbacks", async () => {
  const oldObserver = globalThis.IntersectionObserver;
  const oldFocus = document.hasFocus;
  const oldVisibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const observers = [];
  globalThis.IntersectionObserver = class {
    nodes = [];
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      node.getClientRects = () => [{}];
      this.nodes.push(node);
    }
    disconnect() {}
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container),
    calls = [];
  const rows = [message("reply", 2)];
  function Probe({ id }) {
    const ref = React.useRef(null);
    useVisibleThreadReplies(
      ref,
      rows,
      () => calls.push(id),
      "root",
      "same-resource",
    );
    return React.createElement(
      "section",
      { ref },
      React.createElement(
        "article",
        { "data-testid": "message-row", "data-message-id": "reply" },
        React.createElement("div", { "data-testid": "message-body" }, "reply"),
      ),
    );
  }
  const render = (id) =>
    act(() =>
      root.render(
        React.createElement(
          ConversationViewContext.Provider,
          { value: { viewInstanceId: id, focused: true, visible: true } },
          React.createElement(Probe, { id }),
        ),
      ),
    );
  const emit = (observer) =>
    act(() =>
      observer.callback(
        observer.nodes.map((target) => ({ target, isIntersecting: true })),
      ),
    );
  try {
    await render("a");
    const first = observers.at(-1);
    await emit(first);
    await render("b");
    const next = observers.at(-1);
    await emit(first);
    assert.deepEqual(calls, ["a"]);
    await emit(next);
    assert.deepEqual(calls, ["a", "b"]);
  } finally {
    await act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = oldObserver;
    document.hasFocus = oldFocus;
    if (oldVisibility)
      Object.defineProperty(document, "visibilityState", oldVisibility);
    else delete document.visibilityState;
  }
});

import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
const reactURL = new URL(
  "../../../../node_modules/react/index.js",
  import.meta.url,
).href;
const modules = {
  "./MessageComposer": "export const MessageComposer=()=>null;",
  "./MessageThreadRow":
    'export const MessageThreadRow=({message})=>React.createElement("div",{"data-message-id":message.id,"data-testid":"message-row"},React.createElement("div",{"data-testid":"message-body"},message.body),React.createElement("button",{"data-reply-action":message.id},"Reply"));',
  "./MessageThreadSummaryRow":
    'export const MessageThreadSummaryRow=({message,onOpenThread,expanded})=>React.createElement("button",{"data-thread-head-id":message.id,"aria-expanded":expanded,onClick:()=>onOpenThread(message)},"Read replies");',
  "./MessageThreadPanelSkeleton":
    "export const MessageThreadPanelHeader=()=>null;export const ThreadMessageSkeleton=()=>null;",
  "./TypingIndicatorRow": "export const TypingIndicatorRow=()=>null;",
  "./useAnchoredScroll":
    "export const useAnchoredScroll=()=>({isAtBottom:true,newMessageCount:0,onScroll:()=>{},scrollToBottom:()=>{},settleAtBottomAfterLayout:()=>{}});",
  "./useComposerHeightPadding": "export const useComposerHeightPadding=()=>{};",
  "./useStableSendToChannel": "export const useStableSendToChannel=()=>()=>{};",
  "./ComposerActivityAccessory":
    "export const ComposerActivityAccessory=({children})=>children;",
  "./ComposerDockBackdrop":
    "export const ComposerDockBackdrop=({children})=>children;",
  "@/shared/hooks/useEscapeKey": "export const useEscapeKey=()=>{};",
  "@/shared/hooks/use-mobile":
    "export const useIsThreadPanelOverlay=()=>false;",
  "@/shared/ui/VideoReviewNavigation":
    "export const VideoReviewNavigationProvider=({children})=>children;",
  "@/features/huddle/components/HuddleTranscriptIntro":
    "export const HuddleTranscriptIntro=()=>null;",
  "@/shared/layout/AuxiliaryPanel":
    'export const AuxiliaryPanel=({header,children,footer})=>React.createElement("div",null,header,children,footer);export const AuxiliaryPanelBody=React.forwardRef(({children,...props},ref)=>React.createElement("div",{ref,"data-testid":props["data-testid"]},children));',
};
registerHooks({
  resolve(s, c, n) {
    if (modules[s])
      return {
        shortCircuit: true,
        url: `thread-fixture:${encodeURIComponent(s)}`,
      };
    return n(s, c);
  },
  load(u, c, n) {
    if (u.startsWith("thread-fixture:"))
      return {
        shortCircuit: true,
        format: "module",
        source: `import React from ${JSON.stringify(reactURL)};${modules[decodeURIComponent(u.slice(15))]}`,
      };
    return n(u, c);
  },
});
test("read callbacks contain only committed rows and never descendants hidden by a collapsed root", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "http://localhost",
    pretendToBeVisual: true,
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    CSS: { escape: (value) => value },
  });
  document.hasFocus = () => true;
  const originalObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    disconnected = false;
    constructor(callback) {
      this.callback = callback;
    }
    observe(node) {
      node.getClientRects = () => [{}];
      queueMicrotask(() => {
        if (!this.disconnected)
          this.callback([{ target: node, isIntersecting: true }]);
      });
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  test.after(() => {
    globalThis.IntersectionObserver = originalObserver;
  });
  const { threadExpansionKey } = await import(
    "../lib/threadExpansionStorage.ts"
  );
  localStorage.setItem(
    threadExpansionKey(null, undefined, "channel", "root"),
    JSON.stringify([["root", false]]),
  );
  const { MessageThreadPanel } = await import("./MessageThreadPanel.tsx");
  const { buildThreadPanelData } = await import("../lib/threadPanel.ts");
  const msg = (id, parentId = null) => ({
    id,
    parentId,
    rootId: "root",
    createdAt: 1000,
    depth: 0,
    body: id,
    author: "Nora",
    time: "now",
  });
  const messages = [msg("root"), msg("branch", "root"), msg("deep", "branch")];
  const projection = buildThreadPanelData(messages, "root", null, new Set());
  const calls = [];
  const onRevealed = (rows) => {
    for (const row of rows)
      assert.ok(
        document.querySelector(`[data-message-id="${row.id}"]`),
        `${row.id} must actually be committed`,
      );
    calls.push(rows.map((m) => m.id));
  };
  const props = {
    channel: null,
    channelId: "channel",
    channelName: "test",
    isSending: false,
    isFocusMode: false,
    isSinglePanelView: false,
    onCancelReply: () => {},
    onClose: () => {},
    onExpandReplies: () => {},
    onScrollTargetResolved: () => {},
    onSelectReplyTarget: () => {},
    onSend: async () => {},
    replyTargetMessage: null,
    scrollTargetId: null,
    threadHead: projection.threadHead,
    threadReplies: projection.visibleReplies,
    allThreadMessages: messages,
    threadTypingPubkeys: [],
    activityAccessoryVisible: false,
    widthPx: 380,
    onSidebarRepliesRevealed: onRevealed,
  };
  const root = createRoot(document.getElementById("root"));
  await act(async () =>
    root.render(
      React.createElement(MessageThreadPanel, {
        ...props,
        isMessageUnreadById: () => false,
      }),
    ),
  );
  assert.ok(
    document.querySelector('[data-message-id="branch"]'),
    "new sidebar visit ignores legacy root collapse",
  );
  await act(() =>
    document
      .querySelector('button[data-thread-head-id="root"][aria-expanded="true"]')
      .click(),
  );
  calls.length = 0;
  assert.equal(document.querySelector('[data-message-id="branch"]'), null);
  assert.deepEqual(calls, []);
  const unread = (id) => id === "deep";
  await act(async () =>
    root.render(
      React.createElement(MessageThreadPanel, {
        ...props,
        isMessageUnreadById: unread,
        channelId: "unread-channel",
        threadRepliesPending: true,
      }),
    ),
  );
  assert.equal(document.querySelector('[data-message-id="deep"]'), null);
  assert.deepEqual(calls, []);
  await act(async () =>
    root.render(
      React.createElement(MessageThreadPanel, {
        ...props,
        isMessageUnreadById: unread,
        channelId: "unread-channel",
        threadRepliesPending: false,
      }),
    ),
  );
  assert.ok(document.querySelector('[data-message-id="deep"]'));
  assert.ok(calls.some((ids) => ids.includes("deep")));
  await act(async () => root.unmount());
  dom.window.close();
});

test("focused panel restores branch/root disclosure focus for local and synchronized collapses without stealing outside focus", async () => {
  const dom = new JSDOM(
    '<button id="outside">Outside</button><div id="root"></div>',
    { url: "http://localhost" },
  );
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    CSS: { escape: (value) => value },
  });
  const { threadExpansionKey, saveThreadExpansion } = await import(
    "../lib/threadExpansionStorage.ts"
  );
  const { MessageThreadPanel } = await import("./MessageThreadPanel.tsx");
  const { buildThreadPanelData } = await import("../lib/threadPanel.ts");
  const msg = (id, parentId = null) => ({
    id,
    parentId,
    rootId: "root",
    createdAt: 1000,
    depth: 0,
    body: id,
    author: "Nora",
    time: "now",
  });
  const messages = [msg("root"), msg("branch", "root"), msg("deep", "branch")];
  const key = threadExpansionKey(null, "me", "focus-channel", "root");
  localStorage.setItem(
    key,
    JSON.stringify([
      ["root", true],
      ["branch", true],
    ]),
  );
  const projection = buildThreadPanelData(
    messages,
    "root",
    null,
    new Set(["root", "branch"]),
  );
  const props = {
    channel: null,
    channelId: "focus-channel",
    channelName: "test",
    currentPubkey: "me",
    isSending: false,
    isFocusMode: true,
    isSinglePanelView: true,
    onCancelReply: () => {},
    onClose: () => {},
    onExpandReplies: () => {},
    onScrollTargetResolved: () => {},
    onSelectReplyTarget: () => {},
    onSend: async () => {},
    replyTargetMessage: null,
    scrollTargetId: null,
    threadHead: projection.threadHead,
    threadReplies: projection.visibleReplies,
    allThreadMessages: messages,
    threadTypingPubkeys: [],
    activityAccessoryVisible: false,
    widthPx: 800,
  };
  const root = createRoot(document.getElementById("root"));
  const disclosure = (id, open) =>
    document.querySelector(
      `button[data-thread-head-id="${id}"][aria-expanded="${open}"]`,
    );
  const activate = async (button) => {
    assert.ok(button);
    button.focus();
    await act(() => button.click());
  };
  try {
    await act(() =>
      root.render(React.createElement(MessageThreadPanel, props)),
    );
    await activate(disclosure("branch", true));
    assert.equal(document.activeElement, disclosure("branch", false));
    assert.equal(document.querySelector('[data-message-id="deep"]'), null);
    await activate(disclosure("branch", false));
    assert.equal(document.activeElement, disclosure("branch", true));
    await activate(disclosure("root", true));
    assert.equal(document.activeElement, disclosure("root", false));
    await activate(disclosure("root", false));
    assert.equal(document.activeElement, disclosure("root", true));
    document.querySelector('[data-reply-action="deep"]').focus();
    await act(() =>
      saveThreadExpansion(
        key,
        new Map([
          ["root", true],
          ["branch", false],
        ]),
      ),
    );
    assert.equal(
      document.activeElement,
      disclosure("branch", false),
      "a synchronized collapse returns focus from its removed descendant",
    );
    await activate(disclosure("branch", false));
    document.querySelector('[data-reply-action="deep"]').focus();
    await act(() =>
      saveThreadExpansion(
        key,
        new Map([
          ["root", false],
          ["branch", true],
        ]),
      ),
    );
    assert.equal(
      document.activeElement,
      disclosure("root", false),
      "a synchronized root collapse returns focus to the root",
    );
    await activate(disclosure("root", false));
    document.getElementById("outside").focus();
    await act(() =>
      saveThreadExpansion(
        key,
        new Map([
          ["root", true],
          ["branch", false],
        ]),
      ),
    );
    assert.equal(document.activeElement, document.getElementById("outside"));
  } finally {
    await act(() => root.unmount());
    dom.window.close();
  }
});

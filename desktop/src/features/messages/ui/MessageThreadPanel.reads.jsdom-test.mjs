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
    'export const MessageThreadRow=({message})=>React.createElement("div",{"data-message-id":message.id},message.body);',
  "./MessageThreadSummaryRow": "export const MessageThreadSummaryRow=()=>null;",
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
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    CSS: { escape: (value) => value },
  });
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
  assert.equal(document.querySelector('[data-message-id="branch"]'), null);
  assert.deepEqual(calls, []);
  const unread = (id) => id === "deep";
  await act(async () =>
    root.render(
      React.createElement(MessageThreadPanel, {
        ...props,
        isMessageUnreadById: unread,
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
        threadRepliesPending: false,
      }),
    ),
  );
  assert.ok(document.querySelector('[data-message-id="deep"]'));
  assert.ok(calls.some((ids) => ids.includes("deep")));
  await act(async () => root.unmount());
  dom.window.close();
});

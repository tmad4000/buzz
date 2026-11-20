import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const reactURL = new URL(
  "../../../../node_modules/react/index.js",
  import.meta.url,
).href;
const modules = {
  "./useInlineThreadWindow":
    "export const useInlineThreadWindow=()=>globalThis.__threadRetention.query;",
  "@/features/channels/hooks":
    "export const useChannelMembersQuery=()=>globalThis.__threadRetention.members;",
  "@/features/channels/useMessageEventProfilePubkeys":
    "export const useMessageEventProfilePubkeys=()=>globalThis.__threadRetention.pubkeys;",
  "@/features/moderation/hooks":
    "export const useRelaySelfQuery=()=>globalThis.__threadRetention.self;",
  "@/features/profile/hooks":
    "export const useUsersBatchQuery=()=>globalThis.__threadRetention.profiles;",
  "@/features/messages/ui/useVisibleThreadReplies":
    "export const useVisibleThreadReplies=()=>{};",
  "@/shared/hooks/use-mobile": "export const useIsMobile=()=>false;",
  "@/features/messages/ui/MessageComposer":
    "export const MessageComposer=()=>null;",
  "@/features/messages/ui/MessageThreadRow":
    'export const MessageThreadRow=({message})=>React.createElement("div",{"data-message-id":message.id},message.body,React.createElement("button",{"data-reply-action":message.id},"Reply"));',
  "@/features/messages/ui/MessageThreadSummaryRow":
    'export const MessageThreadSummaryRow=({message,expanded,onOpenThread})=>React.createElement("button",{"data-thread-head-id":message.id,"aria-expanded":expanded,onClick:()=>onOpenThread(message)},"Replies");',
  "@/features/messages/ui/MessageThreadReplyState":
    "export const ThreadRepliesErrorCard=()=>null;",
};
registerHooks({
  resolve(s, c, n) {
    return modules[s]
      ? {
          shortCircuit: true,
          url: `retention-fixture:${encodeURIComponent(s)}`,
        }
      : n(s, c);
  },
  load(u, c, n) {
    return u.startsWith("retention-fixture:")
      ? {
          shortCircuit: true,
          format: "module",
          source: `import React from ${JSON.stringify(reactURL)};${modules[decodeURIComponent(u.slice(18))]}`,
        }
      : n(u, c);
  },
});
test("a mounted inline answer retains its granted ancestry after edits/count changes; manual collapse and a new visit win", async () => {
  localStorage.clear();
  const viewer = "a".repeat(64),
    other = "b".repeat(64),
    agent = "c".repeat(64);
  const rootId = "1".repeat(64),
    branchId = "2".repeat(64),
    answerId = "3".repeat(64);
  const { threadDisplayKey } = await import("../lib/threadDisplayPolicy.ts");
  const { threadExpansionKey, saveThreadExpansion } = await import(
    "../lib/threadExpansionStorage.ts"
  );
  localStorage.setItem(
    threadDisplayKey(null, viewer),
    JSON.stringify({ channels: "smart", replies: "collapsed" }),
  );
  const event = (id, pubkey, content, parent, at) => ({
    id,
    pubkey,
    content,
    kind: 9,
    created_at: at,
    tags: [
      ["e", rootId, "", "root"],
      ["e", parent, "", "reply"],
    ],
  });
  let events = [
    event(branchId, viewer, "Check signing", rootId, 101),
    event(answerId, agent, "Signed and notarized.", branchId, 102),
  ];
  const fixture = {
    members: { data: [] },
    pubkeys: [],
    self: { data: undefined },
    profiles: { data: { profiles: {} } },
    query: null,
  };
  globalThis.__threadRetention = fixture;
  const setEvents = () => {
    fixture.query = {
      data: { pages: [{ events, nextCursor: null }] },
      hasNextPage: false,
      isPending: false,
      isError: false,
      isFetching: false,
    };
  };
  setEvents();
  const { InlineAutoExpansionProvider } = await import(
    "./InlineAutoExpansion.tsx"
  );
  const { InlineChannelThread } = await import(
    "../../channels/ui/InlineChannelThread.tsx"
  );
  const rootMessage = {
    id: rootId,
    rootId,
    parentId: null,
    pubkey: other,
    createdAt: 100,
    body: "Deployment details",
    author: "Alex",
    time: "now",
    depth: 0,
    kind: 9,
  };
  const profiles = {
    [agent]: { pubkey: agent, displayName: "Ava", isAgent: true },
    [viewer]: { pubkey: viewer, displayName: "Me" },
    [other]: { pubkey: other, displayName: "Alex" },
  };
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  // The production inline data hook reads committed local events from this cache.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const render = async (entry = "one", shown = true) =>
    act(() =>
      root.render(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(
            InlineAutoExpansionProvider,
            { key: entry, scope: entry, currentPubkey: viewer },
            shown
              ? React.createElement(InlineChannelThread, {
                  channel: {
                    id: "channel",
                    name: "test",
                    channelType: "stream",
                  },
                  currentPubkey: viewer,
                  root: rootMessage,
                  summary: {
                    replyCount: events.length,
                    lastReplyAt: 110,
                    participants: [],
                  },
                  profiles,
                  disabled: false,
                  isSending: false,
                  onOpenThread: () => {},
                  onSend: async () => {},
                })
              : null,
          ),
        ),
      ),
    );
  try {
    await render();
    assert.ok(node.textContent.includes("Signed and notarized."));
    const long = "This answer was expanded after reading began. ".repeat(20);
    events = [events[0], { ...events[1], content: long }];
    setEvents();
    await render();
    assert.ok(
      node.textContent.includes(long),
      "editing past the short-answer limit must not hide the granted answer",
    );
    const short = "Signed and notarized.";
    events = [events[0], { ...events[1], content: short }];
    setEvents();
    await render();
    assert.ok(node.textContent.includes(short));
    events = [
      ...events,
      ...[4, 5, 6].map((i) =>
        event(
          String(i).repeat(64),
          other,
          `More context ${i}`,
          rootId,
          102 + i,
        ),
      ),
    ];
    setEvents();
    await render();
    assert.ok(
      node.textContent.includes(short),
      "growing beyond four replies must not hide the granted answer",
    );
    await render("one", false);
    await render();
    assert.ok(
      node.textContent.includes(short),
      "virtualizer eviction retains the current visit's answer ancestry",
    );
    const key = threadExpansionKey(null, viewer, "channel", rootId);
    assert.equal(
      localStorage.getItem(key),
      null,
      "automatic reveal does not save manual choices",
    );
    node.querySelector(`[data-reply-action="${answerId}"]`).focus();
    await act(() => saveThreadExpansion(key, new Map([[branchId, false]])));
    assert.equal(
      document.activeElement,
      node.querySelector(
        `[data-testid="inline-branch-toggle"][data-thread-head-id="${branchId}"][aria-expanded="false"]`,
      ),
      "synchronized nested collapse returns focus from the removed inline reply",
    );
    assert.equal(
      node.textContent.includes(short),
      false,
      "a manual collapse remains authoritative",
    );
    await act(() => saveThreadExpansion(key, new Map([[branchId, true]])));
    assert.ok(node.textContent.includes(short));
    await render("next-visit");
    assert.equal(
      node.querySelector('[data-testid="inline-thread"]'),
      null,
      "the previous visit's automatic root grant does not leak",
    );
    events = events.slice(0, 2);
    setEvents();
    await render("container-collapse");
    assert.ok(node.textContent.includes(short));
    node.querySelector(`[data-reply-action="${answerId}"]`).focus();
    await act(() =>
      saveThreadExpansion(`${key}:inline`, new Map([[rootId, false]])),
    );
    assert.equal(node.querySelector('[data-testid="inline-thread"]'), null);
    assert.equal(
      document.activeElement,
      node.querySelector(
        `button[data-thread-head-id="${rootId}"][aria-expanded="false"]`,
      ),
      "synchronized container collapse returns focus to its surviving channel disclosure",
    );
  } finally {
    await act(() => root.unmount());
    client.clear();
    node.remove();
    delete globalThis.__threadRetention;
  }
});

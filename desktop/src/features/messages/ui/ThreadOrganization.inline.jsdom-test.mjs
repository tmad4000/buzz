import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { finalizeEvent } from "nostr-tools/pure";
import { runThreadLinkWork } from "../lib/threadLinkWorker.ts";
import { parseThreadLink, THREAD_LINK_MARKER } from "../lib/threadLinks.ts";
import { formatTimelineMessages } from "../lib/formatTimelineMessages.ts";

const reactURL = new URL(
  "../../../../node_modules/react/index.js",
  import.meta.url,
).href;
const stubs = {
  "./useInlineThreadWindow":
    "export const useInlineThreadWindow=(...args)=>{globalThis.__organizedInline.calls.push(args);return globalThis.__organizedInline.query}",
  "@/features/channels/hooks":
    "export const useChannelMembersQuery=()=>globalThis.__organizedInline.members;",
  "@/features/channels/useMessageEventProfilePubkeys":
    "export const useMessageEventProfilePubkeys=()=>[];",
  "@/features/moderation/hooks":
    "export const useRelaySelfQuery=()=>({data:null});",
  "@/features/profile/hooks":
    "export const useUsersBatchQuery=()=>globalThis.__organizedInline.profiles;",
};
registerHooks({
  resolve(s, c, n) {
    return stubs[s]
      ? { shortCircuit: true, url: `organized-inline:${encodeURIComponent(s)}` }
      : n(s, c);
  },
  load(u, c, n) {
    return u.startsWith("organized-inline:")
      ? {
          shortCircuit: true,
          format: "module",
          source: `import React from ${JSON.stringify(reactURL)};${stubs[decodeURIComponent(u.slice(17))]}`,
        }
      : n(u, c);
  },
});

test("production inline and sidebar both render moved C+D under A; native sends and fallback remain intact", async () => {
  localStorage.clear();
  const key = new Uint8Array(32).fill(1),
    channelId = "11111111-2222-4333-8444-555555555555";
  const scope = { communityUrl: "https://relay.example", channelId };
  const sign = (content, at, tags = []) =>
    finalizeEvent(
      { kind: 9, created_at: at, content, tags: [["h", channelId], ...tags] },
      key,
    );
  const a = sign("A", 1),
    c = sign("C", 2),
    d = sign("D", 3, [["e", c.id, "", "reply"]]);
  const annotation = sign("Organize C", 4, [
    ["t", THREAD_LINK_MARKER],
    ["buzz-thread-op", "link"],
    ["buzz-thread-child", c.id],
    ["buzz-thread-parent", a.id],
    ["buzz-thread-previous", "none"],
  ]);
  const originals = [a, c, d],
    before = JSON.stringify(originals);
  const projection = runThreadLinkWork({
    type: "project",
    scope,
    messages: originals,
    annotations: [annotation],
    auxiliary: [],
    unavailableEventIds: new Set(),
  });
  assert.equal(projection.status, "complete");
  let snapshot = {
    projection,
    events: [...originals, annotation],
    originals,
    annotations: [annotation],
    parsedAnnotations: [parseThreadLink(annotation, scope).annotation],
    canonicalRoots: [a.id, c.id],
  };
  const fixture = {
    calls: [],
    members: { data: [] },
    profiles: { data: { profiles: {} }, isPending: false },
    query: {
      data: { pages: [{ events: [], nextCursor: null }] },
      isPending: false,
      isError: false,
      hasNextPage: false,
    },
  };
  globalThis.__organizedInline = fixture;
  const { ThreadOrganizationContext } = await import(
    "./ThreadOrganization.tsx"
  );
  const { useInlineThreadData } = await import("./useInlineThreadData.ts");
  const { useIndependentThreadPanel } = await import(
    "../useIndependentThreadPanel.ts"
  );
  const channel = {
    id: channelId,
    name: "test",
    isMember: true,
    channelType: "stream",
    visibility: "private",
    memberPubkeys: [],
    participants: [],
    participantPubkeys: [],
  };
  const formatted = formatTimelineMessages(
    originals,
    channel,
    a.pubkey,
    null,
    {},
  );
  let root = formatted.find((m) => m.id === a.id),
    inline,
    sidebar;
  function View() {
    inline = useInlineThreadData(
      {
        channel,
        root,
        currentPubkey: a.pubkey,
        profiles: {},
        ownerProfiles: {},
        personaLookup: new Map(),
        respondToLookup: new Map(),
        summary: { replyCount: 2, lastReplyAt: 3 },
        isUnread: () => false,
      },
      true,
      "scope",
      { channels: "expanded", replies: "expanded" },
    );
    sidebar = useIndependentThreadPanel({
      activeChannel: channel,
      channelEvents: originals,
      threadReplyEvents: [],
      organization: snapshot,
      rootId: root.id,
      replyTargetId: null,
      expandedReplyIds: new Set([a.id, c.id]),
      currentPubkey: a.pubkey,
      currentAvatarUrl: null,
      profiles: {},
      ownerProfiles: {},
      members: [],
      personaLookup: new Map(),
      respondToLookup: new Map(),
      relaySelfPubkey: null,
    });
    return null;
  }
  const node = document.createElement("div");
  document.body.append(node);
  const mounted = createRoot(node);
  const render = () =>
    act(async () =>
      mounted.render(
        React.createElement(
          ThreadOrganizationContext.Provider,
          { value: { snapshot } },
          React.createElement(View),
        ),
      ),
    );
  try {
    await render();
    for (const view of [inline, sidebar]) {
      assert.deepEqual(
        view.messages.map((m) => m.id),
        [a.id, c.id, d.id],
      );
      assert.equal(view.messages.find((m) => m.id === d.id).rootId, a.id);
      assert.equal(
        view.messages.find((m) => m.id === d.id).canonicalRootId,
        c.id,
      );
      assert.equal(
        view.messages.find((m) => m.id === c.id).canonicalParentId,
        null,
      );
    }
    assert.equal(inline.complete, true);
    assert.equal(inline.query.isPending, false);
    assert.equal(inline.query.isError, false);
    assert.equal(
      fixture.calls.at(-1)[2],
      false,
      "complete verified union owns this view; no native A-only query",
    );
    // Reopening the moved subroot must not reinterpret its projected A parent
    // as canonical wire ancestry.
    root = inline.messages.find((m) => m.id === c.id);
    await render();
    assert.deepEqual(
      inline.messages.map((m) => m.id),
      [c.id, d.id],
    );
    assert.equal(inline.canonicalRoot, c.id);
    assert.equal(inline.messages[0].canonicalRootId, null);
    assert.equal(inline.messages[0].canonicalParentId, null);
    snapshot = null;
    root = formatted.find((m) => m.id === a.id);
    await render();
    assert.deepEqual(
      inline.messages.map((m) => m.id),
      [a.id],
    );
    assert.equal(
      fixture.calls.at(-1)[2],
      true,
      "missing projection returns to native query",
    );
    assert.equal(JSON.stringify(originals), before);
  } finally {
    await act(async () => mounted.unmount());
    node.remove();
    delete globalThis.__organizedInline;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { ThreadExpansionScopeProvider } from "./ThreadExpansionScope.tsx";
import { useUnreadSidebarThread } from "./useUnreadSidebarThread.ts";
import { threadExpansionKey } from "../lib/threadExpansionStorage.ts";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";

const message = (id, parentId = null, extra = {}) => ({
  id,
  parentId,
  rootId: "root",
  createdAt: 1,
  depth: 0,
  body: id,
  author: "Nora",
  pubkey: "other",
  time: "now",
  ...extra,
});
const messages = [
  message("root"),
  message("branch", "root"),
  message("leaf", "branch"),
];
async function fixture() {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const snapshots = new Map(),
    views = new Map();
  let optionsA = {};
  function Probe({ id }) {
    const options = id === "a" ? optionsA : {};
    views.set(
      id,
      useUnreadSidebarThread({
        enabled: true,
        channelId: "channel",
        currentPubkey: "self",
        root: "root",
        messages,
        scrollTargetId: null,
        initialMode: "smart",
        visitOnly: true,
        isUnread: () => false,
        ...options,
      }),
    );
    return null;
  }
  const render = async (showA = true, nextOptions = optionsA) => {
    optionsA = nextOptions;
    await act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          ...[...(showA ? ["a"] : []), "b"].map((id) =>
            React.createElement(
              ConversationViewContext.Provider,
              {
                key: id,
                value: {
                  viewInstanceId: id,
                  focused: id === "a",
                  visible: true,
                },
              },
              React.createElement(
                ThreadExpansionScopeProvider,
                {
                  viewId: id,
                  channelId: "channel",
                  currentPubkey: "self",
                  initialSnapshot: snapshots.get(id),
                  seedLegacy: false,
                  onChange: (snapshot) => {
                    snapshots.set(id, snapshot);
                    return true;
                  },
                },
                React.createElement(Probe, { id }),
              ),
            ),
          ),
        ),
      ),
    );
  };
  await render();
  return {
    views,
    snapshots,
    render,
    close: async () => {
      await act(() => root.unmount());
      element.remove();
    },
  };
}
const choices = (snapshot) =>
  new Map(snapshot?.entries.flatMap(([, branches]) => branches) ?? []);

test("scoped visit-only manual collapse survives remount without changing a duplicate view", async () => {
  const h = await fixture();
  try {
    assert.equal(h.views.get("a").expanded.has("branch"), true);
    await act(() => h.views.get("a").setExpanded("branch", false));
    assert.equal(choices(h.snapshots.get("a")).get("branch"), false);
    assert.equal(h.snapshots.has("b"), false);
    assert.equal(h.views.get("b").expanded.has("branch"), true);
    await h.render(false);
    await h.render(true);
    assert.equal(h.views.get("a").expanded.has("branch"), false);
    assert.equal(h.views.get("b").expanded.has("branch"), true);
    await act(() => h.views.get("a").toggle(messages[1]));
    assert.equal(choices(h.snapshots.get("a")).get("branch"), true);
  } finally {
    await h.close();
  }
});

test("automatic reveal choices cannot leak into a later manual persistence snapshot", async () => {
  const h = await fixture();
  try {
    await act(() => h.views.get("a").setExpanded("branch", false));
    const before = JSON.stringify(h.snapshots.get("a"));
    await act(() => h.views.get("a").reveal("leaf"));
    assert.equal(h.views.get("a").expanded.has("branch"), true);
    assert.equal(JSON.stringify(h.snapshots.get("a")), before);
    const own = message("own", "branch", {
      pubkey: "self",
      pending: true,
      renderKey: "optimistic-own",
    });
    await h.render(true, { messages: [...messages, own] });
    assert.equal(JSON.stringify(h.snapshots.get("a")), before);
    await act(() => h.views.get("a").setExpanded("leaf", false));
    const saved = choices(h.snapshots.get("a"));
    assert.equal(
      saved.get("branch"),
      false,
      "fresh own reveal must not replace the durable collapse",
    );
    assert.equal(saved.get("leaf"), false);
    assert.equal(saved.has("own"), false);
    assert.equal(saved.has("root"), false);
  } finally {
    await h.close();
  }
});

test("unscoped visit-only behavior still skips loading and persisting manual preferences", async () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const key = threadExpansionKey(
    loadActiveCommunityId(),
    undefined,
    "legacy-visit",
    "root",
  );
  const previous = localStorage.getItem(key);
  const seed = JSON.stringify([["branch", false]]);
  localStorage.setItem(key, seed);
  let latest;
  function Probe() {
    latest = useUnreadSidebarThread({
      enabled: true,
      channelId: "legacy-visit",
      root: "root",
      messages,
      scrollTargetId: null,
      visitOnly: true,
    });
    return null;
  }
  try {
    await act(() => root.render(React.createElement(Probe, { key: "first" })));
    assert.equal(
      latest.expanded.has("branch"),
      true,
      "legacy visit ignores saved manual collapse",
    );
    await act(() => latest.setExpanded("branch", false));
    await act(() => root.render(React.createElement(Probe, { key: "next" })));
    assert.equal(latest.expanded.has("branch"), true);
    assert.equal(localStorage.getItem(key), seed);
  } finally {
    await act(() => root.unmount());
    element.remove();
    if (previous === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous);
  }
});

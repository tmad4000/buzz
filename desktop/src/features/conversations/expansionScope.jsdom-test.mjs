import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ThreadExpansionScopeProvider,
  useThreadExpansionStorage,
} from "@/features/messages/ui/ThreadExpansionScope";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import { THREAD_EXPANSION_CHANGED } from "@/features/messages/lib/threadExpansionStorage";

test("owning visit imports legacy once, shares local explicit snapshots and fences siblings/retired callbacks", async () => {
  const root = createRoot(document.createElement("div"));
  const community = loadActiveCommunityId();
  const canonical = `buzz-thread-expansion.v1:${JSON.stringify([community, "identity", "channel", "root"])}`;
  const key = (id) =>
    `buzz-thread-expansion.v2:${JSON.stringify([community, "identity", "channel", "root", id])}`;
  const previous = localStorage.getItem(canonical);
  localStorage.setItem(
    canonical,
    JSON.stringify([
      ["branch", true],
      ["closed", false],
    ]),
  );
  const stores = {},
    events = [];
  let snapshotA,
    snapshotB,
    accept = true;
  const listener = (event) => events.push(event.detail.key);
  window.addEventListener(THREAD_EXPANSION_CHANGED, listener);
  function Probe({ id }) {
    stores[id] = useThreadExpansionStorage();
    return null;
  }
  const render = (showA = true) =>
    act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          showA
            ? React.createElement(
                ThreadExpansionScopeProvider,
                {
                  key: "a",
                  viewId: "a",
                  channelId: "channel",
                  currentPubkey: "identity",
                  seedLegacy: true,
                  initialSnapshot: snapshotA,
                  onChange: (next) => {
                    if (!accept) return false;
                    snapshotA = next;
                    return true;
                  },
                },
                React.createElement(Probe, { id: "a" }),
              )
            : null,
          React.createElement(
            ThreadExpansionScopeProvider,
            {
              key: "b",
              viewId: "b",
              channelId: "channel",
              currentPubkey: "identity",
              initialSnapshot: snapshotA,
              onChange: (next) => {
                snapshotB = next;
                return true;
              },
            },
            React.createElement(Probe, { id: "b" }),
          ),
        ),
      ),
    );
  try {
    // Render A first so its migrated snapshot is available when B is allocated.
    await act(() =>
      root.render(
        React.createElement(
          ThreadExpansionScopeProvider,
          {
            viewId: "a",
            channelId: "channel",
            currentPubkey: "identity",
            seedLegacy: true,
            onChange: (next) => {
              snapshotA = next;
              return true;
            },
          },
          React.createElement(Probe, { id: "a" }),
        ),
      ),
    );
    assert.equal(snapshotA.legacySeeded, true);
    assert.equal(stores.a.load(key("a")).get("closed"), false);
    await render();
    assert.equal(stores.b.load(key("b")).get("branch"), true);
    await act(() =>
      assert.equal(stores.a.save(key("a"), new Map([["branch", false]])), true),
    );
    assert.equal(stores.a.load(key("a")).get("branch"), false);
    assert.equal(stores.b.load(key("b")).get("branch"), true);
    assert.equal(stores.a.load(key("b")).size, 0);
    assert.deepEqual(events, [key("a")]);
    assert.equal(snapshotB, undefined);
    accept = false;
    await act(() =>
      assert.equal(stores.a.save(key("a"), new Map([["branch", true]])), false),
    );
    assert.equal(stores.a.load(key("a")).get("branch"), false);
    const stale = stores.a;
    await render(false);
    assert.equal(stale.save(key("a"), new Map([["branch", true]])), false);
    assert.equal(stores.b.load(key("b")).get("branch"), true);
    assert.equal(
      localStorage.getItem(canonical),
      JSON.stringify([
        ["branch", true],
        ["closed", false],
      ]),
    );
  } finally {
    await act(() => root.unmount());
    window.removeEventListener(THREAD_EXPANSION_CHANGED, listener);
    if (previous === null) localStorage.removeItem(canonical);
    else localStorage.setItem(canonical, previous);
  }
});

test("late identity readiness remounts the owning store and retires placeholder callbacks", async () => {
  const root = createRoot(document.createElement("div"));
  const community = loadActiveCommunityId();
  const canonical = `buzz-thread-expansion.v1:${JSON.stringify([community, "identity", "channel", "root"])}`;
  const key = `buzz-thread-expansion.v2:${JSON.stringify([community, "identity", "channel", "root", "a"])}`;
  const previous = localStorage.getItem(canonical);
  localStorage.setItem(canonical, JSON.stringify([["closed", false]]));
  let store,
    snapshot,
    imports = 0;
  function Probe() {
    store = useThreadExpansionStorage();
    return null;
  }
  const render = (currentPubkey) =>
    act(() =>
      root.render(
        React.createElement(
          ThreadExpansionScopeProvider,
          {
            viewId: "a",
            channelId: "channel",
            currentPubkey,
            seedLegacy: true,
            onChange: (next) => {
              snapshot = next;
              imports += 1;
              return true;
            },
          },
          React.createElement(Probe),
        ),
      ),
    );
  try {
    await render(undefined);
    const placeholder = store;
    assert.equal(imports, 0);
    await render("identity");
    assert.equal(imports, 1);
    assert.equal(snapshot.legacySeeded, true);
    assert.equal(store.load(key).get("closed"), false);
    assert.equal(placeholder.save(key, new Map([["closed", true]])), false);
    await render("identity");
    assert.equal(imports, 1, "unchanged ready visit does not import again");
    assert.equal(store.load(key).get("closed"), false);
  } finally {
    await act(() => root.unmount());
    if (previous === null) localStorage.removeItem(canonical);
    else localStorage.setItem(canonical, previous);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { OfflineStorageSettings } from "./OfflineStorageSettings.tsx";
import { CommunitiesProvider } from "@/features/communities/useCommunities";
import {
  isChannelHeadCacheEnabled,
  hydrateChannelHeads,
} from "@/features/messages/lib/channelHeadCache";
import {
  loadChannelHeadCache,
  storeChannelHeadCache,
  clearChannelHeadCache,
} from "@/shared/api/tauriChannelHeadCache";
test("R5 flag OFF preserves legacy load/store/hydration and opening Storage has zero encrypted IPC/migration", async () => {
  window.localStorage.clear();
  globalThis.localStorage = window.localStorage;
  globalThis.isTauri = true;
  const calls = [];
  const scope = { pubkey: "alice", relayUrl: "wss://one" };
  const event = {
    id: "head",
    pubkey: "alice",
    kind: 9,
    created_at: 1,
    tags: [["h", "general"]],
    content: "body",
    sig: "",
  };
  const bounds = {
    id: "bounds",
    pubkey: "",
    kind: 39006,
    created_at: 0,
    tags: [["d", "general:head"]],
    content: JSON.stringify({ has_more: false, next_cursor: null }),
    sig: "",
  };
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      calls.push(command);
      if (command === "get_relay_http_url") return "https://relay.test";
      if (command === "get_media_proxy_port") return 7777;
      if (command === "channel_head_cache_load")
        return [
          {
            channelId: "general",
            events: [event, bounds],
            savedAt: 1,
            lastVisitedAt: 1,
          },
        ];
    },
  };
  window.localStorage.setItem(
    "buzz-channels.v1:wss://other:other-account",
    "legacy sidebar",
  );
  assert.equal(isChannelHeadCacheEnabled(), true);
  await loadChannelHeadCache(scope);
  await storeChannelHeadCache(scope, "general", [event, bounds]);
  const client = new QueryClient();
  await hydrateChannelHeads(client, scope);
  assert.equal(
    client.getQueryData(["channel-messages", "general"])[0].id,
    "head",
  );
  assert.equal(client.getQueryData(["offline-snapshot", "general"]), undefined);
  window.localStorage.setItem("buzz-channel-head-cache", "off");
  assert.equal(isChannelHeadCacheEnabled(), false);
  window.localStorage.removeItem("buzz-channel-head-cache");
  await clearChannelHeadCache(scope);
  // Imported .8 media/relay services initialize asynchronously. Only these two
  // known metadata calls are excluded; cache/identity/migration IPC is forbidden.
  const cacheCalls = () =>
    calls.filter(
      (command) =>
        command !== "get_relay_http_url" && command !== "get_media_proxy_port",
    );
  const before = cacheCalls().length;
  window.localStorage.setItem(
    "buzz-communities",
    JSON.stringify([{ id: "one", name: "One", relayUrl: "wss://one" }]),
  );
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () => {
      root.render(
        React.createElement(
          CommunitiesProvider,
          null,
          React.createElement(OfflineStorageSettings),
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    assert.equal(
      cacheCalls().length,
      before,
      `Settings while OFF must not inspect native encrypted storage or identity; observed ${JSON.stringify(calls)}`,
    );
    assert.deepEqual(cacheCalls(), [
      "channel_head_cache_load",
      "channel_head_cache_store",
      "channel_head_cache_load",
      "channel_head_cache_clear",
    ]);
    assert.equal(
      window.localStorage.getItem("buzz-channels.v1:wss://other:other-account"),
      "legacy sidebar",
    );
  } finally {
    await act(() => root.unmount());
    client.clear();
    window.localStorage.clear();
  }
});

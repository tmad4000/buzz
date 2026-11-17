import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
});

before(() => {
  Object.assign(globalThis, {
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    window: dom.window,
  });
});

after(() => dom.window.close());

test("same-second star and unstar mutations survive at capacity", async () => {
  const { act, cleanup, renderHook } = await import("@testing-library/react");
  const { relayClient } = await import("@/shared/api/relayClient");
  const { MAX_CHANNEL_STAR_ENTRIES, readChannelStarsStore, storageKey } =
    await import("./channelStarsStorage.ts");
  const { useChannelStars } = await import("./useChannelStars.ts");

  const originalFetchEvents = relayClient.fetchEvents;
  const originalSubscribeLive = relayClient.subscribeLive;
  const originalSubscribeToReconnects = relayClient.subscribeToReconnects;
  const originalDateNow = Date.now;
  const updatedAt = 1_234_567;
  Date.now = () => updatedAt * 1_000;
  relayClient.fetchEvents = async () => [];
  relayClient.subscribeLive = async () => async () => {};
  relayClient.subscribeToReconnects = () => () => {};

  const relayUrl = "wss://relay.example";
  const channels = Object.fromEntries(
    Array.from({ length: MAX_CHANNEL_STAR_ENTRIES }, (_, index) => [
      `z-channel-${String(index).padStart(3, "0")}`,
      { starred: true, updatedAt },
    ]),
  );

  try {
    for (const [pubkey, action, expectedStarred] of [
      ["pk-star", "starChannel", true],
      ["pk-unstar", "unstarChannel", false],
    ]) {
      window.localStorage.setItem(
        storageKey(pubkey),
        JSON.stringify({ version: 1, channels }),
      );
      const { result, unmount } = renderHook(() =>
        useChannelStars(pubkey, relayUrl),
      );

      act(() => result.current[action]("a-target"));

      const persisted = readChannelStarsStore(pubkey);
      assert.equal(
        Object.keys(persisted.channels).length,
        MAX_CHANNEL_STAR_ENTRIES,
      );
      assert.deepEqual(persisted.channels["a-target"], {
        starred: expectedStarred,
        updatedAt,
      });
      unmount();
    }
  } finally {
    cleanup();
    Date.now = originalDateNow;
    relayClient.fetchEvents = originalFetchEvents;
    relayClient.subscribeLive = originalSubscribeLive;
    relayClient.subscribeToReconnects = originalSubscribeToReconnects;
  }
});

test("bulk conversion persists one complete snapshot and keeps existing favorites", async () => {
  const { act, cleanup, renderHook } = await import("@testing-library/react");
  const { relayClient } = await import("@/shared/api/relayClient");
  const { readChannelStarsStore, storageKey } = await import(
    "./channelStarsStorage.ts"
  );
  const { useChannelStars } = await import("./useChannelStars.ts");
  const originals = [
    relayClient.fetchEvents,
    relayClient.subscribeLive,
    relayClient.subscribeToReconnects,
  ];
  relayClient.fetchEvents = async () => [];
  relayClient.subscribeLive = async () => async () => {};
  relayClient.subscribeToReconnects = () => () => {};
  const pk = "pk-bulk-conversion";
  const channels = Object.fromEntries(
    Array.from({ length: 500 }, (_, i) => [
      `old-${i}`,
      { starred: i === 0, updatedAt: 1 },
    ]),
  );
  window.localStorage.setItem(
    storageKey(pk),
    JSON.stringify({ version: 1, channels }),
  );
  const proto = Object.getPrototypeOf(window.localStorage);
  const save = proto.setItem;
  let writes = 0;
  proto.setItem = function (key, value) {
    if (key === storageKey(pk)) writes++;
    return save.call(this, key, value);
  };
  try {
    const { result, unmount } = renderHook(() =>
      useChannelStars(pk, "wss://bulk.test"),
    );
    act(() => result.current.starChannel(["new-one", "new-two"]));
    const persisted = readChannelStarsStore(pk);
    assert.equal(writes, 1);
    assert.equal(Object.keys(persisted.channels).length, 500);
    for (const id of ["old-0", "new-one", "new-two"])
      assert.equal(persisted.channels[id].starred, true);
    unmount();
  } finally {
    proto.setItem = save;
    cleanup();
    [
      relayClient.fetchEvents,
      relayClient.subscribeLive,
      relayClient.subscribeToReconnects,
    ] = originals;
  }
});

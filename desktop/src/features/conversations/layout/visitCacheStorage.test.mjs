import assert from "node:assert/strict";
import test from "node:test";
import { ConversationVisitCache, parseVisitCache } from "./visitCache.ts";
import { MAX_LAYOUT_BYTES } from "./schema.ts";
import {
  restoreVisitCache,
  saveVisitCache,
  visitCacheStorageKey,
} from "./visitCacheStorage.ts";

const scope = {
  communityId: "community",
  identityPubkey: "identity",
  windowSlot: "main",
};
const chat = (channelId, id = "a") => ({
  id,
  channelId,
  panelState: { thread: `root-${channelId}` },
  timelineAnchor: null,
  threadAnchor: null,
});
const serialize = (chats) =>
  JSON.stringify({ version: 1, views: [{ viewId: "a", chats }] });

test("stored visit cache rejects unbounded, duplicate, mismatched and command-bearing data", () => {
  for (const raw of [
    "invalid",
    " ".repeat(MAX_LAYOUT_BYTES + 1),
    serialize(Array.from({ length: 21 }, (_, n) => chat(`channel-${n}`))),
    serialize([chat("channel"), chat("channel")]),
    serialize([chat("channel", "different-view")]),
    serialize([{ ...chat("channel"), panelState: { autoSend: "send" } }]),
    serialize([
      {
        ...chat("channel"),
        timelineAnchor: { messageId: "message", offset: null },
      },
    ]),
    JSON.stringify({ version: 2, views: [] }),
    JSON.stringify({
      version: 1,
      views: [
        { viewId: "a", chats: [] },
        { viewId: "a", chats: [] },
      ],
    }),
  ])
    assert.equal(parseVisitCache(raw), null, raw.slice(0, 100));
  assert.ok(parseVisitCache(serialize([chat("channel")])));
});

test("failed recovery backup preserves original cache; restored ordering retains recent twenty", () => {
  const key = visitCacheStorageKey(scope);
  const entries = new Map([[key, "{corrupt"]]);
  const writes = [];
  const cache = new ConversationVisitCache();
  cache.remember(chat("current"));
  assert.equal(
    saveVisitCache(
      {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => {
          writes.push(key);
          if (key.endsWith(":recovery")) throw new Error("quota");
          entries.set(key, value);
        },
      },
      scope,
      cache,
    ),
    false,
  );
  assert.equal(entries.get(key), "{corrupt");
  assert.deepEqual(writes, [`${key}:recovery`]);
  const restored = restoreVisitCache(
    {
      getItem: () =>
        serialize(Array.from({ length: 20 }, (_, n) => chat(`channel-${n}`))),
    },
    scope,
  );
  restored.remember(chat("newest"));
  assert.equal(restored.recall("a", "channel-0"), undefined);
  assert.equal(
    restored.recall("a", "channel-1").panelState.thread,
    "root-channel-1",
  );
});

test("retiring views removes only their presentation and unchanged saves do not write again", () => {
  const cache = new ConversationVisitCache();
  cache.remember(chat("channel", "a"));
  cache.remember(chat("channel", "b"));
  cache.retain(new Set(["b"]));
  assert.equal(cache.recall("a", "channel"), undefined);
  assert.ok(cache.recall("b", "channel"));
  const entries = new Map();
  let writes = 0;
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
      writes++;
    },
  };
  assert.equal(saveVisitCache(storage, scope, cache), true);
  assert.equal(saveVisitCache(storage, scope, cache), true);
  assert.equal(writes, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ConversationVisitCache, parseVisitCache } from "./visitCache.ts";
import { MAX_LAYOUT_BYTES } from "./schema.ts";
import {
  readingPositionKey,
  readPosition,
  updateReadingPosition,
} from "./readingPositions.ts";
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

test("visit serialization retains bounded mode positions and returns defensive copies", () => {
  const key = readingPositionKey("thread", "split", "root");
  const value = {
    ...chat("channel"),
    readingPositions: updateReadingPosition(undefined, key, {
      id: "reply",
      offset: -8,
      pixel: 100,
      neighbors: ["root"],
    }),
  };
  const cache = new ConversationVisitCache();
  cache.remember(value);
  value.readingPositions[0].position.neighbors.push("source-mutation");
  const restored = new ConversationVisitCache();
  assert.equal(restored.restore(cache.serialize()), true);
  const first = restored.recall("a", "channel");
  assert.deepEqual(readPosition(first.readingPositions, key).neighbors, [
    "root",
  ]);
  first.readingPositions[0].position.neighbors.push("caller-mutation");
  assert.deepEqual(
    readPosition(restored.recall("a", "channel").readingPositions, key)
      .neighbors,
    ["root"],
  );
  assert.equal(
    parseVisitCache(
      serialize([
        {
          ...value,
          readingPositions: Array.from(
            { length: 9 },
            () => value.readingPositions[0],
          ),
        },
      ]),
    ),
    null,
  );
});

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

test("view preferences survive cache reload independently and never alias duplicates", () => {
  const cache = new ConversationVisitCache();
  const preferences = {
    timelineMode: "timeline",
    threadMode: "focus",
    preferredThreadWidth: 640,
  };
  cache.remember({ ...chat("same", "a"), preferences });
  cache.remember({
    ...chat("same", "b"),
    preferences: {
      timelineMode: "threads",
      threadMode: "split",
      preferredThreadWidth: 400,
    },
  });
  preferences.preferredThreadWidth = 999;
  const restored = new ConversationVisitCache();
  assert.equal(restored.restore(cache.serialize()), true);
  const a = restored.recall("a", "same");
  assert.equal(a.preferences.preferredThreadWidth, 640);
  assert.equal(
    restored.recall("b", "same").preferences.timelineMode,
    "threads",
  );
  a.preferences.timelineMode = "threads";
  assert.equal(
    restored.recall("a", "same").preferences.timelineMode,
    "timeline",
  );
});

test("old visits remain valid but invalid or command-bearing preferences are rejected", () => {
  assert.ok(parseVisitCache(serialize([chat("same")])));
  for (const preferences of [
    { timelineMode: "activity" },
    { threadMode: "overlay" },
    { preferredThreadWidth: 319 },
    { preferredThreadWidth: 4097 },
    { preferredThreadWidth: null },
    { autoSend: "send" },
  ])
    assert.equal(
      parseVisitCache(serialize([{ ...chat("same"), preferences }])),
      null,
    );
});

test("explicit disclosures round-trip in the bounded visit cache without automatic state", () => {
  const cache = new ConversationVisitCache();
  cache.remember({
    ...chat("channel"),
    explicitExpansion: {
      legacySeeded: true,
      entries: [["root", [["branch", false]]]],
    },
  });
  const restored = new ConversationVisitCache();
  assert.equal(restored.restore(cache.serialize()), true);
  const selected = restored.recall("a", "channel");
  assert.equal(selected.explicitExpansion.entries[0][1][0][1], false);
  selected.explicitExpansion.entries[0][1][0][1] = true;
  assert.equal(
    restored.recall("a", "channel").explicitExpansion.entries[0][1][0][1],
    false,
  );
  assert.equal(
    parseVisitCache(
      serialize([
        {
          ...chat("channel"),
          explicitExpansion: {
            legacySeeded: true,
            entries: [],
            automatic: ["branch"],
          },
        },
      ]),
    ),
    null,
  );
});

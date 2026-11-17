import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceHostWatch,
  isPaseoCommunity,
  isPaseoWorkingCard,
  isPaseoWorkingReaction,
  PASEO_HOST_PUBKEY as PK,
  PASEO_STALE_MS,
} from "./paseoHostHealth.ts";
const start = 1000;
const initial = () => ({
  startedAt: start,
  lastSeenAt: null,
  offlineSince: null,
});
test("host expires locally only after three minutes, even with no responses", () => {
  let state = advanceHostWatch(
    initial(),
    { status: "online", observedAt: 2000 },
    2000,
  );
  state = advanceHostWatch(state, { observedAt: 0 }, 2000 + PASEO_STALE_MS);
  assert.equal(state.offlineSince, null);
  state = advanceHostWatch(state, { observedAt: 0 }, 2001 + PASEO_STALE_MS);
  assert.equal(state.offlineSince, 2000);
  assert.equal(
    advanceHostWatch(state, { status: "offline", observedAt: 300000 }, 300000)
      .offlineSince,
    2000,
  );
  state = advanceHostWatch(
    state,
    { status: "away", observedAt: 300001 },
    300001,
  );
  assert.equal(state.offlineSince, null);
  assert.equal(state.lastSeenAt, 300001);
});
test("unknown startup has a three-minute grace; stale cache cannot heal outage", () => {
  let state = advanceHostWatch(
    initial(),
    { observedAt: 0 },
    start + PASEO_STALE_MS + 1,
  );
  assert.equal(state.offlineSince, start);
  state = advanceHostWatch(
    state,
    { status: "online", observedAt: 100 },
    start + PASEO_STALE_MS + 2,
  );
  assert.equal(state.offlineSince, start);
});
test("Paseo host watch is restricted to the exact secure community", () => {
  for (const url of [
    "wss://jprojects.communities.buzz.xyz",
    "https://jprojects.communities.buzz.xyz/",
  ])
    assert.equal(isPaseoCommunity(url), true);
  for (const url of [
    undefined,
    "ws://jprojects.communities.buzz.xyz",
    "wss://jprojects.communities.buzz.xyz.evil.test",
    "wss://other.test",
    "wss://jprojects.communities.buzz.xyz/path",
  ])
    assert.equal(isPaseoCommunity(url), false);
});
test("only signed Paseo working status cards, not names or human messages, qualify", () => {
  const body = "⏳ Working\nItem: example\n\nBuilding";
  assert.equal(isPaseoWorkingCard({ pubkey: PK, body }), true);
  assert.equal(isPaseoWorkingCard({ pubkey: PK.toUpperCase(), body }), true);
  assert.equal(
    isPaseoWorkingCard({ pubkey: PK, signerPubkey: "human", body }),
    false,
  );
  assert.equal(isPaseoWorkingCard({ pubkey: "human", body }), false);
  for (const b of [
    "⏳ Working on an answer",
    "✅ Shipped\nItem: example",
    "❓ Waiting on Jacob\nItem: example",
  ])
    assert.equal(isPaseoWorkingCard({ pubkey: PK, body: b }), false);
  assert.equal(
    isPaseoWorkingCard({
      pubkey: PK,
      body: "⏳ Working — Agent\nReported status · source: root",
    }),
    true,
  );
});
test("hourglass staleness is author-scoped; other emoji/users remain normal", () => {
  assert.equal(
    isPaseoWorkingReaction({ emoji: "⏳", users: [{ pubkey: PK }] }),
    true,
  );
  assert.equal(
    isPaseoWorkingReaction({
      emoji: "⏳️",
      users: [{ pubkey: PK.toUpperCase() }],
    }),
    true,
  );
  assert.equal(
    isPaseoWorkingReaction({ emoji: "✅", users: [{ pubkey: PK }] }),
    false,
  );
  assert.equal(
    isPaseoWorkingReaction({ emoji: "⏳", users: [{ pubkey: "human" }] }),
    false,
  );
});

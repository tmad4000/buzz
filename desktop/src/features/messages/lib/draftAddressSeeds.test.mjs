import assert from "node:assert/strict";
import test from "node:test";

import {
  addressDraft,
  DRAFT_ADDRESS_SEED_TTL_MS,
  requestDraftAddressSeed,
  subscribeDraftAddressSeed,
} from "./draftAddressSeeds.ts";

const AGENT = "1".repeat(64);
const OTHER = "2".repeat(64);
const seed = { pubkey: AGENT.toUpperCase(), displayName: "Scout" };

test("addressDraft leads with a pinned mention plus a separating space", () => {
  const next = addressDraft("what's the ETA?", [], seed);
  assert.equal(next.leadingText, "@Scout ");
  assert.equal(next.content, "@Scout what's the ETA?");
  assert.deepEqual(next.mentionRefs, [
    { displayName: "Scout", pubkey: AGENT, isAgent: true },
  ]);
  assert.equal(next.changed, true);
});

test("addressDraft is idempotent for the same agent", () => {
  const once = addressDraft("", [], seed);
  const twice = addressDraft(once.content, once.mentionRefs, seed);
  assert.equal(twice.changed, false);
  assert.equal(twice.leadingText, "");
  assert.equal(twice.content, once.content);
  assert.equal(twice.mentionRefs.length, 1);
});

test("addressDraft keeps other mentions and re-pins a stale ref", () => {
  const other = { displayName: "Booker", pubkey: OTHER, isAgent: true };
  const stale = { displayName: "Old", pubkey: AGENT, isAgent: true };
  const next = addressDraft("@Booker hi", [other, stale], seed);
  assert.equal(next.content, "@Scout @Booker hi");
  assert.deepEqual(next.mentionRefs, [
    other,
    { displayName: "Scout", pubkey: AGENT, isAgent: true },
  ]);
});

test("a mounted composer applies the seed now; newest composer wins", () => {
  const calls = [];
  const offA = subscribeDraftAddressSeed("c1", (s) => calls.push(["a", s]));
  const offB = subscribeDraftAddressSeed("c1", (s) => calls.push(["b", s]));
  assert.equal(requestDraftAddressSeed("c1", seed), true);
  assert.deepEqual(calls, [["b", seed]]);
  offB();
  assert.equal(requestDraftAddressSeed("c1", seed), true);
  assert.equal(calls.at(-1)[0], "a");
  offA();
});

test("a seed waits for the composer about to mount, once", () => {
  const calls = [];
  assert.equal(requestDraftAddressSeed("c2", seed, 1_000), false);
  const off = subscribeDraftAddressSeed("c2", (s) => calls.push(s), 1_500);
  assert.deepEqual(calls, [seed]);
  off();
  const offAgain = subscribeDraftAddressSeed("c2", (s) => calls.push(s));
  assert.equal(calls.length, 1, "consumed seeds never replay");
  offAgain();
});

test("a stale pending seed is dropped, not applied to a later visit", () => {
  const calls = [];
  requestDraftAddressSeed("c3", seed, 0);
  const off = subscribeDraftAddressSeed(
    "c3",
    (s) => calls.push(s),
    DRAFT_ADDRESS_SEED_TTL_MS + 1,
  );
  assert.deepEqual(calls, []);
  off();
});

import assert from "node:assert/strict";
import test from "node:test";
import { activePins } from "./model.ts";
const channel = "test";
const target = "a".repeat(64);
const event = (pubkey, content, created_at, id) => ({
  kind: 40004,
  pubkey,
  content,
  created_at,
  id,
  tags: [
    ["h", channel],
    ["e", target],
  ],
});
test("unpin cannot cancel another signer and event order does not change results", () => {
  const events = [
    event("alice", "pin", 1, "a"),
    event("bob", "unpin", 2, "b"),
    event("alice", "unpin", 3, "c"),
    event("bob", "pin", 4, "d"),
  ];
  assert.deepEqual(
    activePins(events, channel).map((e) => e.pubkey),
    ["bob"],
  );
  assert.deepEqual(
    activePins([...events].reverse(), channel),
    activePins(events, channel),
  );
  assert.deepEqual(activePins(events, "other"), []);
});
test("ties use lowest id; malformed operations never become pins", () => {
  const events = [
    event("alice", "pin", 1, "b"),
    event("alice", "unpin", 1, "a"),
    event("bob", "bogus", 2, "c"),
  ];
  assert.deepEqual(activePins(events, channel), []);
});

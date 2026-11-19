import assert from "node:assert/strict";
import { test, beforeEach, afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import {
  claimHold,
  getHold,
  reconcileHold,
  updateHold,
  controlRelayScope,
} from "./agentControlHolds.ts";
const rev = (n) => ({ eventId: String(n).repeat(64), createdAt: n });
const realNow = Date.now;
let saved;
afterEach(() => {
  Date.now = realNow;
});
beforeEach(() => {
  Date.now = () => 1000;
  saved = new Map();
  globalThis.crypto ??= { randomUUID };
  globalThis.localStorage = {
    getItem: (k) => saved.get(k) ?? null,
    setItem: (k, v) => saved.set(k, v),
  };
});
test("durable claim blocks duplicates and late outcomes cannot overwrite a newer intent", () => {
  const id = claimHold("scope", "stop", "working", rev(1));
  assert.ok(id);
  assert.equal(claimHold("scope", "stop", "working", rev(1)), null);
  reconcileHold("scope", "done", "root", "done");
  assert.ok(getHold("scope"));
  reconcileHold("scope", "stopped", "jacob", "stopped", rev(2));
  assert.equal(getHold("scope"), null);
  const next = claimHold("scope", "continue", "stopped", rev(2));
  updateHold("scope", id, "sent");
  assert.equal(getHold("scope").id, next);
  reconcileHold("scope", "stopped", "jacob", "stopped", rev(2));
  assert.ok(getHold("scope"));
  reconcileHold("scope", "queued", "jacob", "continuation", rev(1));
  assert.ok(getHold("scope"), "older report cannot reconcile");
  reconcileHold("scope", "queued", "jacob", "continuation");
  assert.ok(getHold("scope"), "missing revision cannot reconcile");
  reconcileHold("scope", "queued", "jacob", "continuation", rev(3));
  assert.equal(getHold("scope"), null);
});
test("denied or corrupt storage fails closed; full storage never evicts unresolved attempts", () => {
  localStorage.getItem = () => "broken";
  assert.equal(claimHold("scope", "stop", ""), null);
  assert.equal(getHold("scope").status, "unknown");
  localStorage.getItem = (k) => saved.get(k) ?? null;
  localStorage.setItem = () => {
    throw Error("quota");
  };
  assert.equal(claimHold("scope", "stop", ""), null);
  localStorage.setItem = (k, v) => saved.set(k, v);
  for (let i = 0; i < 128; i++) assert.ok(claimHold(String(i), "stop", ""));
  assert.equal(claimHold("overflow", "stop", ""), null);
  assert.ok(getHold("0"));
});
test("relay scope normalizes transport and rejects credential-bearing URLs", () => {
  assert.equal(
    controlRelayScope("wss://relay.example/"),
    "https://relay.example",
  );
  assert.equal(controlRelayScope("wss://user:secret@relay.example"), null);
  assert.equal(controlRelayScope("wss://relay.example/?token=x"), null);
});

test("a newer signed revision predating the intent cannot clear HOLD; same-second and missing intent timing stay held", () => {
  Date.now = () => 10_000;
  const id = claimHold("scope", "continue", "stopped", rev(2));
  assert.ok(id);
  for (const revision of [rev(3), { eventId: "a".repeat(64), createdAt: 10 }]) {
    reconcileHold("scope", "queued", "jacob", "continuation", revision);
    assert.ok(getHold("scope"));
  }
  reconcileHold("scope", "queued", "jacob", "continuation", {
    eventId: "a".repeat(64),
    createdAt: 11,
  });
  assert.equal(getHold("scope"), null);
  claimHold("old", "continue", "stopped", rev(2));
  const key = [...saved.keys()][0],
    records = JSON.parse(saved.get(key));
  delete records.old.intentAfter;
  saved.set(key, JSON.stringify(records));
  reconcileHold("old", "queued", "jacob", "continuation", {
    eventId: "b".repeat(64),
    createdAt: 20,
  });
  assert.ok(getHold("old"), "legacy intent with unknown cutoff stays held");
});

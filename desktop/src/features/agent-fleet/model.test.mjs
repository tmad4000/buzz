import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import {
  parseFleet,
  fleetEnvelope,
  authenticatedFleet,
  fleetFilter,
  FLEET_BRIDGE,
  FLEET_RECIPIENT,
  FLEET_D,
  newerFleet,
} from "./model.ts";
const raw = fs.readFileSync(
  new URL("./contract-fixtures.json", import.meta.url),
);
const vectors = JSON.parse(raw);
const base = () => structuredClone(vectors.validPayloads[0].payload);
const event = (at = base().observedAt) => ({
  id: "1".repeat(64),
  sig: "0".repeat(128),
  pubkey: FLEET_BRIDGE,
  kind: 30078,
  created_at: at,
  tags: [
    ["d", FLEET_D],
    ["p", FLEET_RECIPIENT],
  ],
  content: "Ag==",
});
test("frozen schema/fixture exact hashes remain unchanged and synthetic vectors claim no authentication/effects", () => {
  assert.equal(
    createHash("sha256").update(raw).digest("hex"),
    "ff5e033cf8af0db25044eaf8790239354a21d478a95f5d67e121ad2454418483",
  );
  const design = fs.readFileSync(
    new URL(
      "../../../../docs/fork/private-fleet-status-v1.md",
      import.meta.url,
    ),
  );
  assert.equal(
    createHash("sha256").update(design).digest("hex"),
    "f8edff4578e56ec626bf7b053812de0c99ca88d6b9284e14a63ba65c0fb8a194",
  );
  assert.equal(vectors.syntheticUnsigned, true);
  assert.equal(vectors.effectsIssued, false);
  assert.equal(vectors.productionAuthenticationClaimed, false);
});
for (const v of vectors.validPayloads)
  test(`frozen valid: ${v.name}`, () =>
    assert.deepEqual(parseFleet(v.payload, v.payload.observedAt), v.payload));
for (const v of vectors.invalidPayloads)
  test(`frozen invalid: ${v.name}`, () =>
    assert.throws(
      () => parseFleet(v.payload, v.payload.observedAt),
      /Private fleet unavailable/,
    ));
const corruptions = {
  missing: (q) => delete q.verifiedAt,
  float: (q) => (q.verifiedAt += 0.5),
  future: (q) => {
    q.observedAt += 61;
    q.verifiedAt = q.observedAt;
  },
  timeLimit: (q) => (q.observedAt = 253402300800),
  sourceAbsent: (q) => {
    q.root.queue.observedAt = q.observedAt;
  },
  unknownNested: (q) => (q.root.queue.privateText = "never export"),
  rootCount: (q) => {
    q.root.state = "blocked";
  },
  futureHost: (q) => (q.otherHosts.m4 = "idle"),
  countMax: (q) => (q.gcp.running = 10001),
  negative: (q) => (q.gcp.running = -1),
  partialCap: (q) => {
    q.availability = "partial";
    q.coverage = { seen: 10000, total: null, complete: false };
    q.gcp = {
      running: 10000,
      idle: 0,
      blocked: 0,
      needsPermission: 0,
      unknown: 0,
    };
  },
};
for (const [name, mutate] of Object.entries(corruptions))
  test(`strict rejection: ${name}`, () => {
    const q = base();
    mutate(q);
    assert.throws(() => parseFleet(q, base().observedAt));
  });
test("queue expires at UI time without making a valid fleet payload malformed", () => {
  const q = vectors.validPayloads[3].payload;
  assert.equal(q.observedAt - q.root.queue.verifiedAt, 120);
  assert.ok(parseFleet(q, q.observedAt + 30));
  const invalid = structuredClone(q);
  invalid.root.queue.observedAt--;
  invalid.root.queue.verifiedAt--;
  assert.throws(() => parseFleet(invalid, q.observedAt));
});
test("complete zero and complete Root/count consistency versus independent partial Root", () => {
  const q = base();
  q.root.state = "unknown";
  q.gcp = { running: 0, idle: 0, blocked: 0, needsPermission: 0, unknown: 0 };
  q.coverage = { seen: 0, total: 0, complete: true };
  assert.ok(parseFleet(q, q.observedAt));
  assert.ok(parseFleet(vectors.validPayloads[1].payload, q.observedAt));
  q.root.state = "running";
  assert.throws(() => parseFleet(q, q.observedAt));
});
test("exact envelope scope/version/clock limits, fixed narrow history filter and authentic foreign rejection", () => {
  const e = event(),
    at = e.created_at;
  assert.ok(fleetEnvelope(e, at));
  for (const patch of [
    { content: "AQ==" },
    { content: "a".repeat(8193) },
    { tags: [...e.tags, ["h", "no"]] },
    { tags: [...e.tags].reverse() },
    { created_at: at + 61 },
  ])
    assert.equal(fleetEnvelope({ ...e, ...patch }, at), false);
  const signed = finalizeEvent(
    { kind: 30078, created_at: at, tags: e.tags, content: e.content },
    generateSecretKey(),
  );
  assert.equal(authenticatedFleet(signed, at), false);
  assert.equal(
    authenticatedFleet({ ...signed, pubkey: FLEET_BRIDGE }, at),
    false,
  );
  assert.equal(
    authenticatedFleet({ ...e, content: "a".repeat(12289) }, at),
    false,
  );
  assert.deepEqual(fleetFilter(), {
    kinds: [30078],
    authors: [FLEET_BRIDGE],
    "#d": [FLEET_D],
    "#p": [FLEET_RECIPIENT],
    limit: 1,
  });
  assert.equal(newerFleet({ ...e, id: "0".repeat(64) }, e), true);
});

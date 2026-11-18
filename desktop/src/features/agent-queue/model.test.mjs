import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent, generateSecretKey } from "nostr-tools/pure";
import {
  parseQueue,
  queueAge,
  authenticatedSibling,
  validEnvelope,
  newer,
  queueFilter,
  QUEUE_BRIDGE,
  QUEUE_RECIPIENT,
} from "./model.ts";
import { snapshot, event, clock, row } from "./fixtures.mjs";
test("exact v1 parser admits ok, empty, omitted, recent and canonical unavailable with retained success time", () => {
  const q = snapshot();
  assert.deepEqual(parseQueue(q, clock), q);
  for (const [depth, items] of [
    [0, []],
    [2, [row()]],
  ]) {
    const v = {
      ...q,
      depth,
      items,
      oldestCreatedAt: depth ? clock - 100 : null,
      omitted: depth - items.length,
      complete: depth === items.length,
    };
    assert.deepEqual(parseQueue(v, clock), v);
  }
  const r = {
    ...row("2".repeat(64)),
    state: "delivered",
    stateObservedAt: clock,
  };
  assert.equal(
    parseQueue({ ...q, recent: [r] }, clock).recent[0].stateObservedAt,
    clock,
  );
  for (const verifiedAt of [null, clock - 200]) {
    const v = {
      ...q,
      availability: "unavailable",
      rootState: "unknown",
      verifiedAt,
      depth: null,
      oldestCreatedAt: null,
      items: [],
      recent: [],
      omitted: 0,
      complete: false,
    };
    assert.equal(parseQueue(v, clock).verifiedAt, verifiedAt);
  }
});
const corruptions = {
  extra: (q) => (q.extra = "private body"),
  missing: (q) => delete q.verifiedAt,
  version: (q) => (q.v = 2),
  server: (q) => (q.serverId = "other"),
  root: (q) => (q.agentId = "other"),
  float: (q) => (q.observedAt += 0.5),
  future: (q) => (q.observedAt = clock + 61),
  verifiedFuture: (q) => (q.verifiedAt = clock + 1),
  unknownState: (q) => (q.rootState = "online"),
  wrongAvailability: (q) => (q.availability = "offline"),
  depthNegative: (q) => (q.depth = -1),
  depthCap: (q) => (q.depth = 1001),
  badArithmetic: (q) => (q.omitted = 1),
  badComplete: (q) => (q.complete = false),
  oldestMissing: (q) => (q.oldestCreatedAt = null),
  oldestLate: (q) => (q.oldestCreatedAt = clock),
  duplicate: (q) => q.items.push({ ...q.items[0] }),
  uppercase: (q) => (q.items[0].id = "A".repeat(64)),
  unknownSource: (q) => (q.items[0].source = "jacob"),
  privatePreview: (q) => (q.items[0].preview = "body from another agent"),
  previewMismatch: (q) => (q.items[0].source = "unknown"),
  steered: (q) => (q.items[0].state = "steered"),
  deliveredPlacement: (q) => (q.items[0].state = "delivered"),
  queuedRecent: (q) => (q.recent = [row("2".repeat(64))]),
  disjoint: (q) => (q.recent = [{ ...q.items[0], state: "delivered" }]),
  extraRow: (q) => (q.items[0].body = "sensitive"),
  rowFuture: (q) => (q.items[0].createdAt = clock + 61),
  rowStateFuture: (q) => (q.items[0].stateObservedAt = clock + 61),
  receiptBeforeEnqueue: (q) => (q.items[0].stateObservedAt = clock - 101),
  noncanonicalUnavailable: (q) => (q.availability = "unavailable"),
  tooMany: (q) =>
    (q.items = Array.from({ length: 65 }, (_, i) =>
      row(i.toString(16).padStart(64, "0")),
    )),
  tooManyRecent: (q) =>
    (q.recent = Array.from({ length: 11 }, (_, i) => ({
      ...row((i + 10).toString(16).padStart(64, "0")),
      state: "delivered",
    }))),
  oversized: (q) => (q.items[0].preview = "a".repeat(16385)),
};
for (const [name, mutate] of Object.entries(corruptions))
  test(`reject frozen-contract violation: ${name}`, () => {
    const q = snapshot();
    mutate(q);
    assert.throws(() => parseQueue(q, clock), /Invalid private queue snapshot/);
  });
test("clock bounds, last SUCCESS freshness, tie ordering and fixed envelope/query", () => {
  const q = snapshot();
  q.items[0].createdAt = clock + 60;
  q.items[0].stateObservedAt = clock + 60;
  assert.ok(parseQueue(q, clock));
  assert.equal(queueAge(q, clock + 120).stale, false);
  assert.equal(queueAge(q, clock + 121).stale, true);
  assert.equal(queueAge(q, clock - 60).seconds, 0);
  assert.equal(queueAge({ ...q, verifiedAt: null }, clock).stale, true);
  const unavailable = { ...q, observedAt: clock + 1000, verifiedAt: clock };
  assert.equal(queueAge(unavailable, clock + 1000).seconds, 1000);
  assert.equal(newer(event("1".repeat(64)), event("2".repeat(64))), true);
  assert.ok(validEnvelope(event()));
  assert.equal(validEnvelope(event("1".repeat(64), clock + 61), clock), false);
  assert.equal(
    validEnvelope({ ...event(), tags: [...event().tags, ["h", "leak"]] }),
    false,
  );
  assert.equal(
    validEnvelope({ ...event(), tags: [...event().tags].reverse() }),
    false,
  );
  assert.equal(validEnvelope({ ...event(), content: "AQ==" }), false);
  assert.equal(
    validEnvelope({ ...event(), content: "a".repeat(24577) }),
    false,
  );
  assert.deepEqual(queueFilter(), {
    kinds: [30078],
    authors: [QUEUE_BRIDGE],
    "#d": ["agent-queue-v1"],
    "#p": [QUEUE_RECIPIENT],
    limit: 1,
  });
});
test("real foreign signed data, forgery and future noise cannot enter authenticated sibling watermark", () => {
  const signed = finalizeEvent(
    {
      kind: 30078,
      created_at: clock,
      tags: event().tags,
      content: event().content,
    },
    generateSecretKey(),
  );
  assert.equal(authenticatedSibling(signed, clock), false);
  assert.equal(
    authenticatedSibling({ ...signed, pubkey: QUEUE_BRIDGE }, clock),
    false,
  );
  assert.equal(
    authenticatedSibling({ ...event(), created_at: clock + 61 }, clock),
    false,
  );
  assert.equal(
    authenticatedSibling({ ...event(), tags: [["d", "agent-runtime"]] }, clock),
    false,
  );
});

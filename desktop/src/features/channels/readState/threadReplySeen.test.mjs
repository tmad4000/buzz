import assert from "node:assert/strict";
import test from "node:test";
import {
  threadSeenKey,
  threadReplySeenKey,
  resolveThreadReplyObservedAt,
} from "./threadReplySeen.ts";
import { mergeReadStateEvents } from "./readStateSnapshot.ts";
test("encrypted observation snapshot merges on another client without channel/read-all inheritance", async () => {
  const contexts = {
    [threadSeenKey("root")]: 200,
    [threadReplySeenKey("root", "seen")]: 200,
    channel: 900,
  };
  const blob = { v: 1, client_id: "device-one", contexts };
  const event = {
    pubkey: "reader",
    kind: 30078,
    created_at: 300,
    tags: [
      ["d", "read-state:device-one"],
      ["t", "read-state"],
    ],
    content: "encrypted",
  };
  const otherDevice = await mergeReadStateEvents(
    [event],
    "reader",
    async (ciphertext) => {
      assert.equal(ciphertext, "encrypted");
      return JSON.stringify(blob);
    },
  );
  const own = (key) => otherDevice.get(key) ?? null;
  assert.equal(resolveThreadReplyObservedAt("root", "seen", own), 200);
  assert.equal(
    resolveThreadReplyObservedAt("root", "same-second-unseen", own),
    null,
  );
  assert.equal(resolveThreadReplyObservedAt("other-root", "reply", own), null);
  assert.equal(
    (
      await mergeReadStateEvents([event], "different-reader", async () =>
        JSON.stringify(blob),
      )
    ).size,
    0,
  );
});

test("a newer observed body never covers an older unobserved or pruned reply", () => {
  const markers = new Map([
    [threadSeenKey("root"), 200],
    [threadReplySeenKey("root", "newer"), 200],
    [threadReplySeenKey("root", "stale"), 90],
  ]);
  const own = (key) => markers.get(key) ?? null;
  assert.equal(resolveThreadReplyObservedAt("root", "older", own), null);
  assert.equal(resolveThreadReplyObservedAt("root", "stale", own), 90);
  assert.equal(resolveThreadReplyObservedAt("root", "newer", own), 200);
  markers.delete(threadReplySeenKey("root", "newer"));
  assert.equal(resolveThreadReplyObservedAt("root", "newer", own), null);
});

test("legacy frontier remains progress-only while observed getter is exact", async () => {
  const { resolveThreadReplySeenAt } = await import("./threadReplySeen.ts");
  const own = (key) => (key === threadSeenKey("root") ? 200 : null);
  assert.equal(resolveThreadReplySeenAt("root", "older", own), 199);
  assert.equal(resolveThreadReplyObservedAt("root", "older", own), null);
});

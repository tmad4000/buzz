import assert from "node:assert/strict";
import test from "node:test";
import { timelineScrollIdentity } from "./timelineScrollIdentity.ts";

const identity = (extra = {}) =>
  timelineScrollIdentity({ channelId: "chat", mode: "threads", ...extra });
test("legacy restoration and node keys remain unchanged outside view hosts", () => {
  assert.deepEqual(identity(), {
    domKey: "chat",
    restorationId: "message-timeline:chat",
  });
  assert.equal(
    identity({ targetMessageId: "m" }).restorationId,
    "message-timeline:chat:target:m",
  );
});
test("duplicate views, modes, resources and explicit targets have distinct restoration identities", () => {
  const cases = [
    { viewInstanceId: "a" },
    { viewInstanceId: "b" },
    { viewInstanceId: "a", mode: "timeline" },
    { viewInstanceId: "a", channelId: "dm" },
    { viewInstanceId: "a", targetMessageId: "m" },
  ].map(identity);
  assert.equal(
    new Set(cases.map((value) => value.restorationId)).size,
    cases.length,
  );
  assert.notEqual(cases[0].domKey, cases[1].domKey);
  assert.equal(
    cases[0].domKey,
    cases[2].domKey,
    "mode changes retain the scroll node",
  );
  assert.equal(
    cases[0].domKey,
    cases[4].domKey,
    "target changes retain the scroll node",
  );
});
test("scoped IDs cannot inject quotes or delimiters into the router's attribute selector", () => {
  const scoped = identity({ viewInstanceId: 'a"[]:', channelId: 'b"[]:' });
  assert.equal(scoped.restorationId.includes('"'), false);
  assert.notEqual(
    scoped.restorationId,
    identity({ viewInstanceId: "a", channelId: '"[]:b"[]:' }).restorationId,
  );
});

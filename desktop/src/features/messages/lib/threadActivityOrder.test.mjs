import assert from "node:assert/strict";
import { test } from "node:test";
import { orderThreadsByActivity } from "./threadActivityOrder.ts";
const entry = (id, time, lastReplyAt = null) => ({
  message: { id, createdAt: time },
  summary: lastReplyAt == null ? null : { lastReplyAt },
});
test("activity includes unloaded reply summaries, keeps roots intact and leaves input untouched", () => {
  const a = entry("a", 1, 10),
    b = entry("b", 2),
    c = entry("c", 3, 8);
  const source = [a, b, c];
  assert.deepEqual(orderThreadsByActivity(source), [b, c, a]);
  assert.deepEqual(source, [a, b, c]);
  assert.equal(orderThreadsByActivity(source)[2], a);
});
test("stable ties, root timestamp floor, no edit/reaction bump", () => {
  assert.deepEqual(
    orderThreadsByActivity([entry("z", 5, 2), entry("a", 5, 5)]).map(
      (e) => e.message.id,
    ),
    ["a", "z"],
  );
  const root = entry("old", 1);
  root.message.edited = true;
  root.message.reactions = [{ count: 99 }];
  assert.equal(orderThreadsByActivity([entry("new", 2), root])[0], root);
});
test("reading holds root positions but updates summaries, preserves prepends/deletions; release applies activity", () => {
  const a = entry("a", 1, 20),
    b = entry("b", 2),
    older = entry("older", 0);
  assert.deepEqual(
    orderThreadsByActivity([a, b, older], ["a", "deleted", "b"], true),
    [older, a, b],
  );
  assert.deepEqual(orderThreadsByActivity([a, b, older], ["a", "b"], false), [
    older,
    b,
    a,
  ]);
  assert.deepEqual(orderThreadsByActivity([a, b], [], true), [b, a]);
});
test("pending root ACK retains its render identity while order is held", () => {
  const a = entry("a", 1),
    pending = entry("local", 2);
  pending.message.renderKey = "intent";
  const ack = entry("signed", 2, 20);
  ack.message.renderKey = "intent";
  assert.deepEqual(orderThreadsByActivity([ack, a], ["a", "intent"], true), [
    a,
    ack,
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ConversationAutoSendPermits } from "./autoSendPermits.ts";

const bound = {
  action: "PUSH",
  key: "entry",
  channelId: "chat",
  draftKey: "thread:root",
};
const incoming = {
  scopeKey: "scope",
  key: "entry",
  channelId: "chat",
  draftKey: "thread:root",
  fresh: true,
  projectionEcho: false,
};
function setup() {
  let sequence = 0;
  const permits = new ConversationAutoSendPermits(
    () => `confirmation-${++sequence}`,
  );
  const cleanup = permits.bindScope("scope", () => true);
  const arm = () => permits.arm("chat", "thread:root");
  return { permits, cleanup, arm };
}

test("only a scoped confirmation bound to its actual fresh entry is consumed once", () => {
  const h = setup();
  const token = h.arm();
  assert.equal(h.permits.bindEntry(token, bound), true);
  const permit = h.permits.consume(token, incoming);
  assert.deepEqual(permit, {
    scopeKey: "scope",
    channelId: "chat",
    draftKey: "thread:root",
    entryKey: "entry",
  });
  assert.equal(Object.isFrozen(permit), true);
  assert.equal(h.permits.consume(token, incoming), null);
  assert.equal(h.permits.consume("copied-state-only", incoming), null);
  h.cleanup();
});

test("cold/traversed/copied/echo/foreign routes cannot use or later replay a permit", () => {
  for (const patch of [
    { fresh: false },
    { projectionEcho: true },
    { key: "copied-entry" },
    { scopeKey: "foreign" },
    { channelId: "other" },
    { draftKey: "other" },
  ]) {
    const h = setup(),
      token = h.arm();
    h.permits.bindEntry(token, bound);
    assert.equal(h.permits.consume(token, { ...incoming, ...patch }), null);
    assert.equal(h.permits.consume(token, incoming), null);
    h.cleanup();
  }
  const h = setup(),
    token = h.arm();
  assert.equal(
    h.permits.consume(token, incoming),
    null,
    "unbound metadata is insufficient",
  );
  h.cleanup();
});

test("first mismatched/traversal binding and rebindings invalidate confirmation", () => {
  for (const patch of [
    { action: "BACK" },
    { channelId: "other" },
    { draftKey: "other" },
    { key: "" },
  ]) {
    const h = setup(),
      token = h.arm();
    assert.equal(h.permits.bindEntry(token, { ...bound, ...patch }), false);
    assert.equal(h.permits.bindEntry(token, bound), false);
    h.cleanup();
  }
  const h = setup(),
    token = h.arm();
  assert.equal(h.permits.bindEntry(token, bound), true);
  assert.equal(h.permits.bindEntry(token, { ...bound, key: "copied" }), false);
  assert.equal(h.permits.consume(token, incoming), null);
  h.cleanup();
});

test("scope replacement, old cleanup and cancellation cannot transfer confirmation", () => {
  const h = setup(),
    old = h.arm();
  h.permits.bindEntry(old, bound);
  const cleanup = h.permits.bindScope("new-scope", () => true);
  h.cleanup();
  assert.equal(h.permits.consume(old, incoming), null);
  const next = h.arm();
  assert.ok(next);
  h.permits.cancel(next);
  assert.equal(h.permits.bindEntry(next, bound), false);
  cleanup();
  assert.equal(h.arm(), null);
});

test("scope callbacks cannot reenter consumption or revive a replaced scope", () => {
  const h = setup();
  let token,
    reenter = false;
  h.permits.bindScope("scope", () => {
    if (reenter) assert.equal(h.permits.consume(token, incoming), null);
    return true;
  });
  token = h.arm();
  h.permits.bindEntry(token, bound);
  reenter = true;
  assert.ok(h.permits.consume(token, incoming));
  h.permits.bindScope("scope", () => {
    h.permits.bindScope("replacement", () => true);
    return true;
  });
  assert.equal(h.arm(), null);
});

test("bounded confirmation capacity fails closed without evicting live records", () => {
  const h = setup();
  const first = h.arm();
  h.permits.bindEntry(first, bound);
  for (let i = 1; i < 128; i++) assert.ok(h.arm());
  assert.equal(h.arm(), null);
  assert.ok(h.permits.consume(first, incoming));
  for (let i = 128; i < 512; i++) {
    const token = h.arm();
    assert.ok(token);
    h.permits.cancel(token);
  }
  assert.equal(
    h.arm(),
    null,
    "cancelled tokens still count toward this scope's bound",
  );
  h.cleanup();
});

test("nonce callback reentrancy cannot exceed pending capacity or reuse a token", () => {
  let permits,
    filled = false,
    sequence = 0;
  permits = new ConversationAutoSendPermits(() => {
    if (!filled) {
      filled = true;
      for (let i = 0; i < 128; i++) assert.ok(permits.arm("chat", "draft"));
    }
    return `nonce-${++sequence}`;
  });
  permits.bindScope("scope", () => true);
  assert.equal(permits.arm("chat", "draft"), null);
  const duplicate = new ConversationAutoSendPermits(() => "same-nonce");
  duplicate.bindScope("scope", () => true);
  const token = duplicate.arm("chat", "draft");
  duplicate.cancel(token);
  assert.equal(duplicate.arm("chat", "draft"), null);
});

test("cancellation inside scope admission rejects the claimed permit permanently", () => {
  const h = setup();
  let token;
  let cancelDuringConsume = false;
  h.permits.bindScope("scope", () => {
    if (cancelDuringConsume) h.permits.cancel(token);
    return true;
  });
  token = h.arm();
  assert.equal(h.permits.bindEntry(token, bound), true);
  cancelDuringConsume = true;
  assert.equal(h.permits.consume(token, incoming), null);
  cancelDuringConsume = false;
  assert.equal(h.permits.consume(token, incoming), null);
  const fresh = h.arm();
  assert.equal(h.permits.bindEntry(fresh, bound), true);
  assert.ok(
    h.permits.consume(fresh, incoming),
    "only a fresh confirmation can proceed",
  );
});

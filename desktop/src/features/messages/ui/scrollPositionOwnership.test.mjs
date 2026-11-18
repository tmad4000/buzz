import assert from "node:assert/strict";
import test from "node:test";
import { createScrollPositionOwnership } from "./scrollPositionOwnership.ts";

test("a replacement restore retires old callbacks without letting old cleanup release its owner", () => {
  const owner = createScrollPositionOwnership();
  assert.equal(owner.blocked(), false);
  const first = owner.acquire();
  const next = owner.acquire();
  assert.equal(first.current(), false);
  first.release();
  assert.equal(owner.blocked(), true);
  assert.equal(next.current(), true);
  next.release();
  next.release();
  assert.equal(owner.blocked(), false);
});
test("explicit retirement is permanent across a later acquisition", () => {
  const owner = createScrollPositionOwnership();
  const old = owner.acquire();
  owner.retire();
  assert.equal(old.current(), false);
  const next = owner.acquire();
  old.release();
  assert.equal(next.current(), true);
  owner.retire();
  assert.equal(next.current(), false);
});

test("queued automatic work stays retired after acquisition and release", () => {
  const owner = createScrollPositionOwnership();
  const queuedEpoch = owner.epoch();
  const lease = owner.acquire();
  lease.release();
  assert.equal(owner.blocked(), false);
  assert.notEqual(owner.epoch(), queuedEpoch);
});

test("initial reservation blocks automatic positioning until acquisition or explicit retirement", () => {
  const owner = createScrollPositionOwnership();
  owner.reserve();
  assert.equal(owner.blocked(), true);
  const restore = owner.acquire();
  assert.equal(owner.blocked(), true);
  assert.equal(restore.current(), true);
  restore.release();
  assert.equal(owner.blocked(), false);
  owner.reserve();
  owner.retire();
  assert.equal(owner.blocked(), false);
  assert.equal(restore.current(), false);
});

test("layout listeners flush only on a live release and stop after unsubscribe", () => {
  const owner = createScrollPositionOwnership();
  const seen = [];
  const unsubscribe = owner.subscribe(() => seen.push(owner.blocked()));
  owner.reserve();
  const old = owner.acquire();
  const live = owner.acquire();
  old.release();
  assert.deepEqual(seen, []);
  live.release();
  assert.deepEqual(seen, [false]);
  owner.reserve();
  owner.retire(false);
  assert.deepEqual(
    seen,
    [false],
    "teardown must not flush deferred layout into a retired scroller",
  );
  owner.reserve();
  owner.retire();
  assert.deepEqual(seen, [false, false]);
  unsubscribe();
  owner.acquire().release();
  assert.deepEqual(seen, [false, false]);
});

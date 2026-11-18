import assert from "node:assert/strict";
import test from "node:test";
import { restoreReadingPosition } from "./timelineReadingPosition.ts";

function harness(run) {
  const original = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  const frames = new Map();
  let next = 0,
    writes = 0,
    pixel = 0;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++next, callback);
    return next;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const element = {
    isConnected: true,
    get scrollTop() {
      return pixel;
    },
    set scrollTop(value) {
      pixel = value;
      writes++;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const tick = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const frame of pending) frame();
  };
  try {
    run({ element, tick, frames, writes: () => writes });
  } finally {
    globalThis.requestAnimationFrame = original.request;
    globalThis.cancelAnimationFrame = original.cancel;
  }
}
const snapshot = { id: null, offset: 0, pixel: 42, neighbors: [] };

test("retirement also fences the final pixel fallback after unrealized-anchor retries", () =>
  harness(({ element, tick, frames, writes }) => {
    let admitted = true,
      realizations = 0;
    restoreReadingPosition(
      element,
      { ...snapshot, id: "missing" },
      ["missing"],
      () => {
        realizations++;
        return false;
      },
      () => admitted,
    );
    for (let n = 0; n < 30; n++) tick();
    assert.equal(realizations, 30);
    assert.equal(writes(), 0);
    admitted = false;
    tick();
    assert.equal(realizations, 30);
    assert.equal(writes(), 0);
    assert.equal(frames.size, 0);
  }));

test("retired admission before first frame produces no scroll write or realization", () =>
  harness(({ element, tick, frames, writes }) => {
    restoreReadingPosition(
      element,
      snapshot,
      [],
      () => assert.fail("must not realize"),
      () => false,
    );
    tick();
    assert.equal(writes(), 0);
    assert.equal(frames.size, 0);
  }));
test("losing admission retires the remaining settle frames without replay on return", () =>
  harness(({ element, tick, frames, writes }) => {
    let admitted = true;
    restoreReadingPosition(
      element,
      snapshot,
      [],
      () => false,
      () => admitted,
    );
    tick();
    assert.equal(element.scrollTop, 42);
    assert.equal(writes(), 1);
    admitted = false;
    tick();
    assert.equal(writes(), 1);
    assert.equal(frames.size, 0);
    admitted = true;
    tick();
    assert.equal(writes(), 1);
  }));
test("legacy callers without an admission predicate retain bounded fallback settling", () =>
  harness(({ element, tick, frames, writes }) => {
    restoreReadingPosition(element, snapshot, [], () => false);
    for (let n = 0; n < 4; n++) tick();
    assert.equal(element.scrollTop, 42);
    assert.equal(writes(), 4);
    assert.equal(frames.size, 0);
  }));

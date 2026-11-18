import assert from "node:assert/strict";
import test from "node:test";
import { restoreReadingPosition } from "./timelineReadingPosition.ts";
import { createReadingRestoreAdmission } from "./readingRestoreAdmission.ts";

function harness(run) {
  const original = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  const frames = new Map();
  const handlers = new Map();
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
    addEventListener: (type, handler) => handlers.set(type, handler),
    removeEventListener: (type, handler) => {
      if (handlers.get(type) === handler) handlers.delete(type);
    },
  };
  const tick = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const frame of pending) frame();
  };
  try {
    run({ element, tick, frames, handlers, writes: () => writes });
  } finally {
    globalThis.requestAnimationFrame = original.request;
    globalThis.cancelAnimationFrame = original.cancel;
  }
}
const snapshot = { id: null, offset: 0, pixel: 42, neighbors: [] };

test("blur and visibility interruptions retire queued restores even with no intervening frame", () =>
  harness(({ element, tick, frames, writes }) => {
    let admitted = true;
    const windowEvents = new EventTarget(),
      documentEvents = new EventTarget();
    const admission = createReadingRestoreAdmission({
      windowEvents,
      documentEvents,
      canRestore: () => admitted,
    });
    try {
      for (const [events, type] of [
        [windowEvents, "blur"],
        [documentEvents, "visibilitychange"],
      ]) {
        const before = writes();
        restoreReadingPosition(
          element,
          snapshot,
          [],
          () => assert.fail("retired realization"),
          admission.capture(),
        );
        admitted = false;
        events.dispatchEvent(new Event(type));
        admitted = true; // No animation frame observed the denied interval.
        tick();
        assert.equal(writes(), before);
        assert.equal(frames.size, 0);
      }
      restoreReadingPosition(
        element,
        snapshot,
        [],
        () => false,
        admission.capture(),
      );
      tick();
      assert.equal(writes(), 1, "a new restore after return may proceed");
    } finally {
      admission.dispose();
    }
  }));

test("scope cleanup and coverage invalidation permanently retire their captured leases", () =>
  harness(({ element, tick, writes }) => {
    const windowEvents = new EventTarget(),
      documentEvents = new EventTarget();
    const admission = createReadingRestoreAdmission({
      windowEvents,
      documentEvents,
      canRestore: () => true,
    });
    restoreReadingPosition(
      element,
      snapshot,
      [],
      () => false,
      admission.capture(),
    );
    admission.invalidate();
    tick();
    assert.equal(writes(), 0);
    restoreReadingPosition(
      element,
      snapshot,
      [],
      () => false,
      admission.capture(),
    );
    admission.dispose();
    tick();
    assert.equal(writes(), 0);
  }));

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

test("completion is reported once and pointer interaction retires even a retained frame callback", () =>
  harness(({ element, tick, frames, handlers, writes }) => {
    const reasons = [];
    const stop = restoreReadingPosition(
      element,
      snapshot,
      [],
      () => false,
      () => true,
      (reason) => reasons.push(reason),
    );
    for (let i = 0; i < 4; i++) tick();
    stop();
    assert.deepEqual(reasons, ["complete"]);
    assert.equal(handlers.size, 0);
    const before = writes(),
      nextReasons = [];
    restoreReadingPosition(
      element,
      snapshot,
      [],
      () => false,
      () => true,
      (reason) => nextReasons.push(reason),
    );
    const retained = [...frames.values()][0];
    handlers.get("pointerdown")();
    retained();
    assert.equal(writes(), before);
    assert.equal(frames.size, 0);
    assert.equal(handlers.size, 0);
    assert.deepEqual(nextReasons, ["gesture"]);
  }));

test("reentrant admission retirement cannot write or reschedule the stopped restore", () =>
  harness(({ element, tick, frames, handlers, writes }) => {
    let stop;
    const reasons = [];
    stop = restoreReadingPosition(
      element,
      snapshot,
      [],
      () => false,
      () => {
        stop();
        return true;
      },
      (reason) => reasons.push(reason),
    );
    tick();
    assert.equal(writes(), 0);
    assert.equal(frames.size, 0);
    assert.equal(handlers.size, 0);
    assert.deepEqual(reasons, ["retired"]);
  }));

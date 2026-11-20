import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureReadingPosition,
  restoreReadingPosition,
} from "./timelineReadingPosition.ts";

test("Back anchor enumerates prior neighbors at the end and falls back when realization is impossible", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  container.getBoundingClientRect = () => ({ top: 0 });
  container.innerHTML = '<div data-message-id="c"></div>';
  container.firstChild.getBoundingClientRect = () => ({ top: -10, bottom: 50 });
  container.scrollTop = 120;
  const snapshot = captureReadingPosition(container, ["a", "b", "c"]);
  assert.deepEqual(snapshot.neighbors, ["b", "a"]);
  container.innerHTML = '<div data-message-id="b"></div>';
  container.firstChild.getBoundingClientRect = () => ({ top: 20, bottom: 50 });
  let frames = [];
  const original = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.push(callback);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  try {
    restoreReadingPosition(container, snapshot, ["a", "b", "new"], () => false);
    frames.shift()();
    assert.equal(
      container.scrollTop,
      150,
      "nearest prior surviving row uses saved offset",
    );
    frames = [];
    container.innerHTML = "";
    container.scrollTop = 999;
    restoreReadingPosition(
      container,
      snapshot,
      ["a", "b", "c", "new"],
      () => false,
    );
    for (let i = 0; i < 32 && frames.length; i++) frames.shift()();
    assert.equal(
      container.scrollTop,
      120,
      "unrealizable anchor falls back to captured pixel",
    );
  } finally {
    globalThis.requestAnimationFrame = original;
    globalThis.cancelAnimationFrame = cancel;
    container.remove();
  }
});

test("an inline reply keeps its own exact offset and records the virtualized root for realization", () => {
  const container = document.createElement("div");
  container.innerHTML =
    '<section data-testid="inline-thread" data-thread-head-id="root"><div data-message-id="reply"></div></section>';
  container.getBoundingClientRect = () => ({ top: 100 });
  container.querySelector("[data-message-id]").getBoundingClientRect = () => ({
    top: 88,
    bottom: 125,
  });
  container.scrollTop = 220;
  assert.deepEqual(
    captureReadingPosition(container, ["older", "root", "newer"]),
    {
      id: "reply",
      offset: -12,
      pixel: 220,
      inlineRootId: "root",
      neighbors: ["newer", "older"],
    },
  );
});

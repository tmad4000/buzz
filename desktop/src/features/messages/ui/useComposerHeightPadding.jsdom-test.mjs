import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useComposerHeightPadding } from "./useComposerHeightPadding.ts";

function Harness({ scroll, composer, settle }) {
  useComposerHeightPadding(scroll, composer, "channel", "css-variable", settle);
  return null;
}

test("composer resize respects semantic reading ownership and never subtracts a virtual spacer twice", async () => {
  const observers = [];
  const priorObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  const frames = new Map();
  const priorRAF = globalThis.requestAnimationFrame;
  const priorCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(1, callback);
    return 1;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const parent = document.createElement("div");
  const scroll = document.createElement("div");
  const composer = document.createElement("div");
  parent.append(scroll, composer);
  document.body.append(parent);
  Object.defineProperties(scroll, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 400 },
  });
  scroll.scrollTop = 600;
  composer.getBoundingClientRect = () => ({ height: 120 });
  let settlements = 0;
  const root = createRoot(document.createElement("div"));
  try {
    await act(async () =>
      root.render(
        React.createElement(Harness, {
          scroll: { current: scroll },
          composer: { current: composer },
          settle: () => {
            settlements++;
            return false;
          },
        }),
      ),
    );
    assert.equal(
      scroll.scrollTop,
      600,
      "semantic refusal must not fall through to raw bottom scrolling",
    );
    assert.equal(frames.size, 0);
    assert.equal(settlements, 1);
    // The reader is 100px above the true floor, inside the old 120px spacer
    // heuristic. Growing the composer must not classify that as bottom intent.
    scroll.scrollTop = 500;
    await act(async () =>
      observers[0].callback([{ borderBoxSize: [{ blockSize: 180 }] }]),
    );
    assert.equal(scroll.scrollTop, 500);
    assert.equal(settlements, 1);
    assert.equal(
      parent.style.getPropertyValue("--composer-overlay-height"),
      "180px",
    );
    assert.equal(frames.size, 0);
  } finally {
    await act(async () => root.unmount());
    parent.remove();
    globalThis.ResizeObserver = priorObserver;
    globalThis.requestAnimationFrame = priorRAF;
    globalThis.cancelAnimationFrame = priorCancel;
  }
});

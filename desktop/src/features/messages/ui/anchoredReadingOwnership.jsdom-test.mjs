import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useAnchoredScroll } from "./useAnchoredScroll.ts";

test("external reading owns automatic writes until release, while explicit commands take over", async () => {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousObserver = globalThis.ResizeObserver;
  let nextFrame = 0;
  const frames = new Map();
  const retained = [];
  const observers = [];
  globalThis.requestAnimationFrame = (callback) => {
    retained.push(callback);
    frames.set(++nextFrame, callback);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  const scroller = document.createElement("div");
  const content = document.createElement("div");
  const row = document.createElement("div");
  row.dataset.messageId = "m1";
  content.append(row);
  scroller.append(content);
  document.body.append(scroller);
  Object.defineProperties(scroller, {
    scrollHeight: { value: 1000 },
    clientHeight: { value: 100 },
  });
  scroller.getBoundingClientRect = () => ({ top: 0, bottom: 100 });
  row.getBoundingClientRect = () => ({
    top: 300 - scroller.scrollTop,
    bottom: 350 - scroller.scrollTop,
  });
  const writes = [];
  scroller.scrollTo = (options) => {
    writes.push(options.top);
    scroller.scrollTop = options.top;
  };
  const container = { current: scroller };
  const contentRef = { current: content };
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  let view;
  function Harness({ channelId = "a", messages = [{ id: "m1" }] }) {
    view = useAnchoredScroll({
      scrollContainerRef: container,
      contentRef,
      channelId,
      isLoading: false,
      messages,
    });
    return null;
  }
  const render = async (props = {}) =>
    act(() => root.render(React.createElement(Harness, props)));
  let unmounted = false;
  try {
    await render();
    const mountFrames = [...retained];
    let lease;
    await act(() => {
      lease = view.beginReadingRestore();
    });
    assert.equal(lease.current(), true);
    scroller.scrollTop = 300;
    const count = writes.length;
    await act(() => {
      for (const observer of observers) observer.callback([]);
      view.onScroll();
      assert.equal(view.settleAtBottomAfterLayout(), false);
    });
    await render({ messages: [{ id: "m1" }, { id: "m2" }] });
    assert.equal(
      writes.length,
      count,
      "resize, scroll and append cannot fight the external restore",
    );
    await act(() => lease.release());
    assert.equal(scroller.scrollTop, 300);
    await act(() => {
      for (const frame of mountFrames) frame(0);
    });
    assert.equal(
      writes.length,
      count,
      "cancelled mount pin cannot revive after external release",
    );
    await render({ messages: [{ id: "m1" }, { id: "m2" }, { id: "m3" }] });
    assert.equal(
      writes.length,
      count,
      "release adopts the mid-history physical anchor",
    );
    await act(() => {
      lease = view.beginReadingRestore();
      view.scrollToBottom();
    });
    assert.equal(lease.current(), false);
    assert.equal(
      writes.length,
      count + 1,
      "explicit latest command wins immediately",
    );
    await act(() => lease.release());
    assert.equal(writes.length, count + 1);
    const oldBegin = view.beginReadingRestore;
    const oldBottom = view.scrollToBottom;
    const oldSend = view.scrollToBottomOnNextUpdate;
    await act(() => {
      lease = view.beginReadingRestore();
    });
    await render({ channelId: "b" });
    assert.equal(lease.current(), false);
    let siblingLease;
    await act(() => {
      siblingLease = view.beginReadingRestore();
    });
    const siblingCount = writes.length;
    await act(() => {
      oldBottom();
      oldSend();
    });
    assert.equal(
      siblingLease.current(),
      true,
      "retired explicit callbacks cannot steal a newer owner",
    );
    assert.equal(writes.length, siblingCount);
    await render({ channelId: "a" });
    assert.equal(
      oldBegin(),
      null,
      "returning to the same channel does not revive an old callback",
    );
    const afterUnmount = view.beginReadingRestore;
    await act(() => root.unmount());
    unmounted = true;
    assert.equal(afterUnmount(), null);
  } finally {
    if (!unmounted) await act(() => root.unmount());
    scroller.remove();
    mount.remove();
    globalThis.requestAnimationFrame = previousRaf;
    globalThis.cancelAnimationFrame = previousCancel;
    globalThis.ResizeObserver = previousObserver;
  }
});

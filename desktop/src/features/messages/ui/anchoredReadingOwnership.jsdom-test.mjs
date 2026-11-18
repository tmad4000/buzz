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

test("virtualized mid-history release does not revive bottom settlement on resize", async () => {
  const previousObserver = globalThis.ResizeObserver;
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  const scroller = document.createElement("div");
  const row = document.createElement("div");
  row.dataset.messageId = "m1";
  scroller.append(row);
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
  let writes = 0;
  let settlements = 0;
  const toBottom = () => {
    writes++;
    scroller.scrollTop = 900;
  };
  const settle = () => {
    settlements++;
  };
  const cancelBottom = () => {};
  const container = { current: scroller };
  const messages = [{ id: "m1" }];
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  let view;
  function Harness() {
    view = useAnchoredScroll({
      scrollContainerRef: container,
      contentRef: container,
      channelId: "virtual",
      isLoading: false,
      messages,
      virtualizerOwnsPrependAnchoring: true,
      virtualScrollToBottom: toBottom,
      virtualSettleAtBottom: settle,
      virtualCancelBottomIntent: cancelBottom,
    });
    return null;
  }
  try {
    await act(() => root.render(React.createElement(Harness)));
    let lease;
    await act(() => {
      lease = view.beginReadingRestore();
    });
    const writeCount = writes;
    const settleCount = settlements;
    await act(() => {
      scroller.scrollTop = 300;
      view.onVirtualizerAtBottomStateChange(false);
      lease.release();
    });
    await act(() => {
      for (const observer of observers) observer.callback([]);
    });
    assert.equal(writes, writeCount);
    assert.equal(
      settlements,
      settleCount,
      "viewport resize must not follow the stale pre-restore bottom flag",
    );
    assert.equal(scroller.scrollTop, 300);
    assert.equal(view.isAtBottom, false);
    // Physical release also repairs a missing virtualizer notification.
    await act(() => {
      view.onVirtualizerAtBottomStateChange(true);
      lease = view.beginReadingRestore();
      scroller.scrollTop = 300;
      lease.release();
    });
    const beforeResize = settlements;
    await act(() => {
      for (const observer of observers) observer.callback([]);
    });
    assert.equal(settlements, beforeResize);
    assert.equal(view.isAtBottom, false);
    // A restore that actually ends at bottom resumes normal resize following.
    await act(() => {
      lease = view.beginReadingRestore();
      scroller.scrollTop = 900;
      lease.release();
    });
    const atBottom = settlements;
    await act(() => {
      for (const observer of observers) observer.callback([]);
    });
    assert.ok(settlements > atBottom);
    assert.equal(view.isAtBottom, true);
  } finally {
    await act(() => root.unmount());
    scroller.remove();
    mount.remove();
    globalThis.ResizeObserver = previousObserver;
  }
});

test("a saved-slot reservation blocks the first pin and yields to a reading gesture or explicit latest", async () => {
  const previousObserver = globalThis.ResizeObserver;
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe() {}
    disconnect() {}
  };
  const scroller = document.createElement("div");
  const row = document.createElement("div");
  row.dataset.messageId = "m1";
  scroller.append(row);
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
  let writes = 0;
  scroller.scrollTop = 300;
  scroller.scrollTo = (options) => {
    writes++;
    scroller.scrollTop = options.top;
  };
  const container = { current: scroller };
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  let view;
  const messages = [{ id: "m1" }];
  function Harness({ channelId = "reserved" }) {
    view = useAnchoredScroll({
      scrollContainerRef: container,
      contentRef: container,
      channelId,
      isLoading: false,
      messages,
      deferInitialPosition: true,
    });
    return null;
  }
  const render = async (props = {}) =>
    act(() => root.render(React.createElement(Harness, props)));
  try {
    await render();
    await act(() => {
      for (const observer of observers) observer.callback([]);
    });
    assert.equal(
      writes,
      0,
      "mount and resize cannot consume a saved slot before its restore starts",
    );
    await act(() => scroller.dispatchEvent(new Event("wheel")));
    await render();
    await act(() => {
      for (const observer of observers) observer.callback([]);
    });
    assert.equal(
      writes,
      0,
      "a reader gesture adopts the current position without pinning",
    );
    assert.equal(view.isAtBottom, false);
    await render({ channelId: "next-reserved" });
    assert.equal(writes, 0);
    await act(() => view.scrollToBottom());
    assert.equal(
      writes,
      1,
      "explicit latest retires an unclaimed reservation immediately",
    );
    assert.equal(view.isAtBottom, true);
  } finally {
    await act(() => root.unmount());
    scroller.remove();
    mount.remove();
    globalThis.ResizeObserver = previousObserver;
  }
});

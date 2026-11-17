import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationLayoutSurface } from "./ConversationLayoutSurface.tsx";
import {
  createConversationView,
  createSingleLayout,
  splitPane,
  swapPanes,
  resizeGroup,
  focusPane,
  listPanes,
} from "./layout/model.ts";

test("surface swaps/resizes/compact projection without remounting views or rewriting desktop geometry; keyboard divider and F6 route explicitly", async () => {
  let n = 0;
  const ids = (kind) => `${kind}-${++n}`;
  const one = createSingleLayout(createConversationView("same", ids), ids);
  const initial = splitPane(
    one,
    one.root.id,
    createConversationView("same", ids),
    "horizontal",
    ids,
  );
  const [a, b] = listPanes(initial.root);
  const measured = { width: 1008, height: 700 };
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const originalObserver = globalThis.ResizeObserver;
  const originalViewport = window.innerWidth;
  const originalFrame = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const observers = new Set();
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.add(callback);
    }
    observe() {}
    disconnect() {
      observers.delete(this.callback);
    }
  };
  HTMLElement.prototype.getBoundingClientRect = function () {
    return this.hasAttribute("data-conversation-layout")
      ? { ...measured, left: 0, top: 0 }
      : originalRect.call(this);
  };
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1440,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const mounts = [];
  let current;
  let update;
  function Pane({ view, headerEndActions }) {
    const [count, setCount] = React.useState(0);
    React.useEffect(() => {
      mounts.push(view.id);
    }, [view.id]);
    return React.createElement(
      "div",
      null,
      headerEndActions,
      React.createElement(
        "button",
        {
          type: "button",
          "data-increment": view.id,
          onClick: () => setCount(count + 1),
        },
        String(count),
      ),
    );
  }
  function App() {
    const [layout, setLayout] = React.useState(initial);
    current = layout;
    update = setLayout;
    return React.createElement(ConversationLayoutSurface, {
      layout,
      labelForView: (view) => view.id,
      renderPane: (options) => React.createElement(Pane, options),
      onFocusPane: (paneId) => setLayout((value) => focusPane(value, paneId)),
      onCommand() {},
      onResize: (groupId, sizes) =>
        setLayout((value) => resizeGroup(value, groupId, sizes)),
    });
  }
  try {
    await act(() => root.render(React.createElement(App)));
    const input = container.querySelector(
      `[data-increment="${a.viewInstanceId}"]`,
    );
    await act(() => input.click());
    await act(() => update((value) => swapPanes(value, a.id, b.id)));
    assert.equal(
      container.querySelector(`[data-increment="${a.viewInstanceId}"]`),
      input,
    );
    assert.equal(input.textContent, "1");
    assert.equal(mounts.length, 2);
    const separator = container.querySelector("[role=separator]");
    await act(() =>
      separator.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowRight",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    assert.ok(Math.abs(current.root.sizes[0] - 0.55) < 1e-9);
    const desktop = JSON.stringify(current.root);
    measured.width = 390;
    await act(() => {
      for (const notify of observers) notify();
    });
    assert.ok(container.querySelector("[data-compact-layout=true]"));
    assert.equal(
      container.querySelectorAll("[data-layout-view]:not([hidden])").length,
      1,
    );
    assert.equal(JSON.stringify(current.root), desktop);
    measured.width = 1008;
    await act(() => {
      for (const notify of observers) notify();
    });
    assert.equal(container.querySelector("[data-compact-layout=true]"), null);
    assert.equal(mounts.length, 2);
    const before = current.focusedPaneId;
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "F6",
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.notEqual(current.focusedPaneId, before);
    assert.equal(mounts.length, 2);
  } finally {
    await act(() => root.unmount());
    container.remove();
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    globalThis.ResizeObserver = originalObserver;
    globalThis.requestAnimationFrame = originalFrame;
    globalThis.cancelAnimationFrame = originalCancel;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalViewport,
    });
  }
});

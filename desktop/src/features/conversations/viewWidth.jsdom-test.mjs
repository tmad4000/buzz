import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ThreadPanelWidthScopeProvider,
  useThreadPanelWidth,
} from "@/shared/hooks/useThreadPanelWidth";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { useIsThreadPanelOverlay } from "@/shared/hooks/use-mobile";

test("duplicate views resize independently without writing shared preference; closing during resize releases handlers", async () => {
  const key = "buzz.desktop.thread-panel-width";
  sessionStorage.setItem(key, "999");
  const api = {};
  const changes = [];
  function Width({ id }) {
    api[id] = useThreadPanelWidth(1000);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const cursor = document.body.style.cursor;
  const selection = document.body.style.userSelect;
  try {
    await act(() =>
      root.render(
        ["a", "b"].map((id, index) =>
          React.createElement(
            ThreadPanelWidthScopeProvider,
            {
              key: id,
              initialWidthPx: 400 + index * 20,
              onChange: (value) => changes.push([id, value]),
            },
            React.createElement(Width, { id }),
          ),
        ),
      ),
    );
    assert.equal(api.a.widthPx, 400);
    assert.equal(api.b.widthPx, 420);
    await act(() => api.a.onResizeStart({ preventDefault() {}, clientX: 600 }));
    await act(() =>
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 500 })),
    );
    assert.equal(api.a.widthPx, 500);
    assert.equal(api.b.widthPx, 420);
    assert.equal(sessionStorage.getItem(key), "999");
    await act(() => root.unmount());
    assert.equal(document.body.style.cursor, cursor);
    assert.equal(document.body.style.userSelect, selection);
    const count = changes.length;
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 300 }));
    assert.equal(changes.length, count);
  } finally {
    sessionStorage.removeItem(key);
  }
});

test("thread overlay derives from leaf content width and retains legacy viewport behavior outside views", async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = () => ({
    addEventListener() {},
    removeEventListener() {},
  });
  const modes = {};
  function Probe({ id }) {
    modes[id] = useIsThreadPanelOverlay();
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = (width) =>
    act(() =>
      root.render([
        React.createElement(
          ConversationViewContext.Provider,
          {
            key: "pane",
            value: {
              viewInstanceId: "a",
              focused: true,
              visible: true,
              contentWidthPx: width,
            },
          },
          React.createElement(Probe, { id: "pane" }),
        ),
        React.createElement(Probe, { key: "legacy", id: "legacy" }),
      ]),
    );
  try {
    await render(759);
    assert.equal(modes.pane, true);
    assert.equal(modes.legacy, window.innerWidth < 600);
    await render(760);
    assert.equal(modes.pane, false);
  } finally {
    await act(() => root.unmount());
    window.matchMedia = originalMatchMedia;
  }
});

test("scoped preferred width clamps to 320 minimum and reserves chat400 plus gutter without overwriting preference during projection", async () => {
  const api = {};
  let available = 1000;
  const writes = [];
  function Probe({ id }) {
    api[id] = useThreadPanelWidth(available);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = () =>
    act(() =>
      root.render(
        [900, 300].map((width, index) =>
          React.createElement(
            ThreadPanelWidthScopeProvider,
            {
              key: index,
              initialWidthPx: width,
              onChange: (value) => writes.push(value),
            },
            React.createElement(Probe, { id: index }),
          ),
        ),
      ),
    );
  try {
    await render();
    assert.equal(api[0].widthPx, 592);
    assert.equal(api[1].widthPx, 320);
    available = 760;
    await render();
    assert.equal(api[0].widthPx, 352);
    available = 1600;
    await render();
    assert.equal(api[0].widthPx, 900);
    assert.deepEqual(writes, []);
  } finally {
    await act(() => root.unmount());
  }
});

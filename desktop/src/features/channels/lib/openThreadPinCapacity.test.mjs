import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useOpenThreadPins } from "./openThreadPinStore.ts";
import { OpenThreadsBar } from "../ui/OpenThreadsBar.tsx";

async function fixture(run) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://unit.invalid",
  });
  const saved = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const root = createRoot(document.getElementById("root"));
  try {
    await run(root, dom.window);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}
const click = async (element, win) =>
  act(() =>
    element.dispatchEvent(new win.MouseEvent("click", { bubbles: true })),
  );
const button = (text) =>
  [...document.querySelectorAll("button")].find((el) =>
    el.textContent.includes(text),
  );
function fill(scope, count) {
  for (let i = 0; i < count; i++)
    localStorage.setItem(`${scope}:busyDismissed.v1:history-${i}`, "true");
}

test("full budget session pin Remove/Undo stays session-only through remount", async () =>
  fixture(async (root, win) => {
    const scope = "capacity-ui";
    fill(scope, 1000);
    const message = {
      id: "temporary",
      body: "Temporary",
      depth: 0,
      createdAt: 1,
    };
    const render = () =>
      act(() =>
        root.render(
          React.createElement(OpenThreadsBar, {
            storageKey: scope,
            entries: [{ message, summary: null }],
            currentThread: null,
            onOpen: () => {},
          }),
        ),
      );
    await render();
    await click(button("Open threads"), win);
    await act(() => {
      const select = document.querySelector('[aria-label="Thread to pin"]');
      select.value = "temporary";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
    });
    await click(button("Pin here"), win);
    assert.ok(document.body.textContent.includes("1 pinned"));
    await click(
      document.querySelector('[aria-label="Remove Temporary from bar"]'),
      win,
    );
    assert.ok(document.body.textContent.includes("0 pinned"));
    assert.equal(localStorage.getItem(`${scope}:pin.v2:temporary`), null);
    await click(button("Undo removal"), win);
    assert.ok(document.body.textContent.includes("1 pinned"));
    assert.ok(document.body.textContent.includes("session-only"));
    assert.equal(localStorage.getItem(`${scope}:pin.v2:temporary`), null);
    await act(() => root.render(null));
    await render();
    assert.ok(document.body.textContent.includes("0 pinned"));
    assert.equal(
      localStorage.getItem(`${scope}:busyDismissed.v1:history-999`),
      "true",
    );
  }));

test("999 dismissals plus saved pin survive fallback Remove/Undo and last-owner remount", async () =>
  fixture(async (root) => {
    const scope = "capacity-mixed";
    fill(scope, 999);
    localStorage.setItem(
      `${scope}:pin.v2:saved`,
      JSON.stringify({ pin: { id: "saved", title: "Saved" }, rank: 0 }),
    );
    let store;
    function Probe() {
      store = useOpenThreadPins(scope);
      return null;
    }
    const render = () => act(() => root.render(React.createElement(Probe)));
    await render();
    assert.equal(store.dismissedSuggestions.size, 999);
    await act(() => store.addPin({ id: "temporary", title: "Temporary" }));
    await act(() => store.removePin("temporary"));
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["saved"],
    );
    await act(() => store.addPin({ id: "temporary", title: "Temporary" }, 1));
    assert.equal(store.sessionOnly, true);
    assert.equal(localStorage.getItem(`${scope}:pin.v2:temporary`), null);
    await act(() => root.render(null));
    await render();
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["saved"],
    );
    assert.equal(store.dismissedSuggestions.size, 999);
    await act(() => store.removePin("saved"));
    assert.deepEqual(store.pins, []);
    await act(() => store.addPin({ id: "saved", title: "Saved" }));
    await act(() => root.render(null));
    await render();
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["saved"],
    );
    assert.equal(store.dismissedSuggestions.size, 999);
  }));

test("legacy seed identity is not an allocated durable register at capacity", async () =>
  fixture(async (root) => {
    const scope = "capacity-legacy";
    fill(scope, 1000);
    localStorage.setItem(
      scope,
      JSON.stringify([{ id: "legacy", title: "Legacy" }]),
    );
    let store;
    function Probe() {
      store = useOpenThreadPins(scope);
      return null;
    }
    const render = () => act(() => root.render(React.createElement(Probe)));
    await render();
    await act(() => store.removePin("legacy"));
    assert.deepEqual(store.pins, []);
    assert.equal(store.sessionOnly, true);
    assert.equal(localStorage.getItem(`${scope}:pin.v2:legacy`), null);
    await act(() => root.render(null));
    await render();
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["legacy"],
    );
    assert.equal(store.dismissedSuggestions.size, 1000);
  }));

test("transient storage failure Remove/Undo can retry without invalidating saved preferences", async () =>
  fixture(async (root, win) => {
    const scope = "capacity-retry";
    fill(scope, 1);
    localStorage.setItem(
      `${scope}:pin.v2:saved`,
      JSON.stringify({ pin: { id: "saved", title: "Saved" }, rank: 0 }),
    );
    let store;
    function Probe() {
      store = useOpenThreadPins(scope);
      return null;
    }
    const render = () => act(() => root.render(React.createElement(Probe)));
    await render();
    const original = win.Storage.prototype.setItem;
    win.Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      await act(() => store.addPin({ id: "new", title: "New" }));
      await act(() => store.removePin("new"));
      assert.deepEqual(
        store.pins.map((pin) => pin.id),
        ["saved"],
      );
    } finally {
      win.Storage.prototype.setItem = original;
    }
    await act(() => store.addPin({ id: "new", title: "New" }));
    assert.equal(store.sessionOnly, false);
    await act(() => store.removePin("new"));
    await act(() => store.addPin({ id: "new", title: "New" }));
    await act(() => root.render(null));
    await render();
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["saved", "new"],
    );
    assert.equal(store.dismissedSuggestions.size, 1);
  }));

test("over-budget existing records remain readable and new identities stay session-only", async () =>
  fixture(async (root) => {
    const scope = "capacity-overflow";
    fill(scope, 1000);
    localStorage.setItem(
      `${scope}:pin.v2:saved`,
      JSON.stringify({ pin: { id: "saved", title: "Saved" }, rank: 0 }),
    );
    let store;
    function Probe() {
      store = useOpenThreadPins(scope);
      return null;
    }
    const render = () => act(() => root.render(React.createElement(Probe)));
    await render();
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["saved"],
    );
    assert.equal(store.dismissedSuggestions.size, 1000);
    await act(() => store.addPin({ id: "new", title: "New" }));
    await act(() => store.removePin("new"));
    assert.equal(localStorage.getItem(`${scope}:pin.v2:new`), null);
    await act(() => root.render(null));
    await render();
    assert.deepEqual(
      store.pins.map((pin) => pin.id),
      ["saved"],
    );
    assert.equal(store.dismissedSuggestions.size, 1000);
  }));

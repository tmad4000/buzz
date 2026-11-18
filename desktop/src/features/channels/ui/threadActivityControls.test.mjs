import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { OpenThreadsBar } from "./OpenThreadsBar.tsx";
import {
  ChannelOrderSetting,
  TimelineViewContext,
  useChannelViewMode,
  timelinePreferenceKey,
} from "./TimelineViewContext.tsx";

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

test("real Order control preserves Threads default, activates/persists Latest activity, scopes channels and keeps Timeline", async () =>
  fixture(async (root, win) => {
    function Control({ channel }) {
      const view = useChannelViewMode("relay", channel);
      return React.createElement(
        TimelineViewContext.Provider,
        { value: view },
        React.createElement(ChannelOrderSetting),
      );
    }
    const render = (channel) =>
      act(() => root.render(React.createElement(Control, { channel })));
    await render("one");
    assert.equal(document.querySelector("select").value, "threads");
    const change = async (value) =>
      act(() => {
        const select = document.querySelector("select");
        select.value = value;
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
    assert.equal(
      document.querySelector('option[value="activity"]').disabled,
      false,
    );
    await change("activity");
    assert.equal(
      localStorage.getItem(timelinePreferenceKey("relay", "one")),
      "activity",
    );
    await render("two");
    assert.equal(document.querySelector("select").value, "threads");
    await change("timeline");
    assert.equal(document.querySelector("select").value, "timeline");
    await render("one");
    assert.equal(document.querySelector("select").value, "activity");
  }));

test("real bar pins canonical loaded roots, navigates through callback, survives remount and restores removal", async () =>
  fixture(async (root, win) => {
    const message = { id: "root", body: "Chris sync", createdAt: 1, depth: 0 };
    const reply = {
      id: "reply",
      rootId: "root",
      parentId: "root",
      body: "Reply",
      createdAt: 2,
      depth: 1,
    };
    const opened = [];
    const render = (storageKey = "scope") =>
      act(() =>
        root.render(
          React.createElement(OpenThreadsBar, {
            key: storageKey,
            storageKey,
            entries: [
              { message, summary: null },
              { message: reply, summary: null },
            ],
            currentThread: null,
            onOpen: (msg) => opened.push(msg.id),
          }),
        ),
      );
    await render();
    assert.equal(document.querySelector("input"), null);
    await click(button("Open threads"), win);
    assert.ok(
      document.body.textContent.includes("Automatic tracking unavailable"),
    );
    assert.equal(document.querySelector('option[value="reply"]'), null);
    await act(() => {
      const select = document.querySelector("select");
      select.value = "root";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
    });
    await click(button("Pin here"), win);
    await click(button("Chris sync"), win);
    assert.deepEqual(opened, ["root"]);
    await click(button("Remove"), win);
    assert.ok(document.body.textContent.includes("0 pinned"));
    await click(button("Undo removal"), win);
    assert.ok(document.body.textContent.includes("1 pinned"));
    await render("other");
    assert.ok(document.body.textContent.includes("0 pinned"));
    await render();
    assert.ok(document.body.textContent.includes("1 pinned"));
  }));

test("pending root is unavailable to picker/current-thread until canonical acknowledgement", async () =>
  fixture(async (root, win) => {
    const render = async (message) =>
      act(() =>
        root.render(
          React.createElement(OpenThreadsBar, {
            storageKey: "pending-scope",
            entries: [{ message, summary: null }],
            currentThread: message,
            onOpen: () => {},
          }),
        ),
      );
    await render({
      id: "optimistic-intent",
      renderKey: "intent",
      pending: true,
      body: "Slow send",
      depth: 0,
      createdAt: 1,
    });
    await click(button("Open threads"), win);
    assert.equal(
      document.querySelector('option[value="optimistic-intent"]'),
      null,
    );
    assert.equal(button("Pin here").disabled, true);
    await render({
      id: "signed-root",
      renderKey: "intent",
      body: "Slow send",
      depth: 0,
      createdAt: 1,
    });
    assert.ok(document.querySelector('option[value="signed-root"]'));
    await act(() => {
      const select = document.querySelector("select");
      select.value = "signed-root";
      select.dispatchEvent(new win.Event("change", { bubbles: true }));
    });
    await click(button("Pin here"), win);
    const stored = Array.from({ length: localStorage.length }, (_, i) =>
      localStorage.getItem(localStorage.key(i)),
    ).join(" ");
    assert.ok(stored.includes("signed-root"));
    assert.ok(!stored.includes("optimistic-intent"));
  }));

test("two same-chat bars share pin operations; external-tab changes, removal and Undo preserve unrelated pins", async () =>
  fixture(async (root, win) => {
    const messages = ["A", "B", "C"].map((id) => ({
      id,
      body: `Thread ${id}`,
      depth: 0,
      createdAt: 1,
    }));
    const props = {
      storageKey: "shared",
      entries: messages.map((message) => ({ message, summary: null })),
      currentThread: null,
      onOpen: () => {},
    };
    const render = () =>
      act(() =>
        root.render(
          React.createElement(
            React.Fragment,
            null,
            React.createElement(
              "div",
              { "data-view": "a" },
              React.createElement(OpenThreadsBar, props),
            ),
            React.createElement(
              "div",
              { "data-view": "b" },
              React.createElement(OpenThreadsBar, props),
            ),
          ),
        ),
      );
    await render();
    const view = (id) => document.querySelector(`[data-view="${id}"]`);
    const find = (id, text) =>
      [...view(id).querySelectorAll("button")].find((el) =>
        el.textContent.includes(text),
      );
    await click(find("a", "Open threads"), win);
    await click(find("b", "Open threads"), win);
    const pin = async (id, rootId) => {
      await act(() => {
        const select = view(id).querySelector("select");
        select.value = rootId;
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      await click(find(id, "Pin here"), win);
    };
    await pin("a", "A");
    await pin("b", "B");
    assert.ok(view("a").textContent.includes("2 pinned"));
    assert.ok(view("b").textContent.includes("2 pinned"));
    await click(
      view("a").querySelector('[aria-label="Remove Thread A from bar"]'),
      win,
    );
    // A second browser context writes only C's independent register.
    await act(() => {
      localStorage.setItem(
        "shared:pin.v2:C",
        JSON.stringify({ pin: { id: "C", title: "Thread C" }, rank: 5 }),
      );
      win.dispatchEvent(
        new win.StorageEvent("storage", { key: "shared:pin.v2:C" }),
      );
    });
    assert.ok(view("b").textContent.includes("2 pinned"));
    await click(find("a", "Undo removal"), win);
    assert.ok(view("a").textContent.includes("3 pinned"));
    assert.ok(view("b").textContent.includes("3 pinned"));
    // Remount both owners: all three register operations survived persistence.
    await act(() => root.render(null));
    await render();
    assert.ok(view("a").textContent.includes("3 pinned"));
    assert.ok(view("b").textContent.includes("3 pinned"));
  }));

test("legacy pins are a read-only seed; tombstones survive remount and failed writes are visibly session-only", async () =>
  fixture(async (root, win) => {
    localStorage.setItem(
      "legacy",
      JSON.stringify([{ id: "A", title: "Thread A" }]),
    );
    const messages = ["A", "B"].map((id) => ({
      id,
      body: `Thread ${id}`,
      depth: 0,
      createdAt: 1,
    }));
    const render = () =>
      act(() =>
        root.render(
          React.createElement(OpenThreadsBar, {
            storageKey: "legacy",
            entries: messages.map((message) => ({ message, summary: null })),
            currentThread: null,
            onOpen: () => {},
          }),
        ),
      );
    await render();
    await click(button("Open threads"), win);
    await click(
      document.querySelector('[aria-label="Remove Thread A from bar"]'),
      win,
    );
    await act(() => root.render(null));
    await render();
    assert.ok(document.body.textContent.includes("0 pinned"));
    assert.ok(localStorage.getItem("legacy").includes("Thread A"));
    const original = win.Storage.prototype.setItem;
    win.Storage.prototype.setItem = () => {
      throw new Error("Quota exhausted");
    };
    try {
      await act(() => {
        const select = document.querySelector("select");
        select.value = "B";
        select.dispatchEvent(new win.Event("change", { bubbles: true }));
      });
      await click(button("Pin here"), win);
      assert.ok(document.body.textContent.includes("1 pinned"));
      assert.ok(document.body.textContent.includes("session-only"));
    } finally {
      win.Storage.prototype.setItem = original;
    }
  }));

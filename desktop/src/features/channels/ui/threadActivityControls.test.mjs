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

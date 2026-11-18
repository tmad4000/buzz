import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useThreadRowWindow } from "./useThreadRowWindow.ts";
test("focused row windows stay bounded, retain their anchor, and honor explicit targets across scopes", async () => {
  const entries = Array.from({ length: 10000 }, (_, i) => ({
    message: { id: `m${i}` },
    summary: null,
  }));
  let view;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Harness({
    scope = "a",
    target = null,
    unread = "m5000",
    data = entries,
  }) {
    view = useThreadRowWindow(data, scope, true, false, unread, target);
    return null;
  }
  const render = async (props = {}) =>
    act(() => root.render(React.createElement(Harness, props)));
  try {
    await render();
    assert.equal(view.entries.length, 40);
    assert.ok(view.entries.some((e) => e.message.id === "m5000"));
    const first = view.entries[0].message.id;
    await render({ unread: "m9000" });
    assert.equal(
      view.entries[0].message.id,
      first,
      "new unread does not jump the view",
    );
    await act(() => view.showLater());
    assert.equal(view.entries.length, 40);
    assert.notEqual(view.entries[0].message.id, first);
    await render({ target: "m9999" });
    assert.equal(view.entries.length, 40);
    assert.equal(view.entries.at(-1).message.id, "m9999");
    await act(() => view.showEarlier());
    const paged = view.entries[0].message.id;
    assert.notEqual(
      view.entries.at(-1).message.id,
      "m9999",
      "manual paging wins over an already consumed jump",
    );
    await render({ target: "m9999" });
    assert.equal(view.entries[0].message.id, paged);
    await render({ target: null });
    assert.equal(
      view.entries[0].message.id,
      paged,
      "settling a jump does not snap back",
    );
    await render({ scope: "b", unread: "m10" });
    assert.equal(view.entries[0].message.id, "m2");
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

test("loaded anchor preparation is bounded, target-safe and retired with its scope", async () => {
  const entries = Array.from({ length: 1000 }, (_, i) => ({
    message: { id: `m${i}` },
    summary: null,
  }));
  let view;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Harness({
    scope = "a",
    target = null,
    pending = false,
    enabled = true,
  }) {
    view = useThreadRowWindow(
      entries,
      scope,
      enabled,
      pending,
      undefined,
      target,
    );
    return null;
  }
  const render = async (props = {}) =>
    act(() => root.render(React.createElement(Harness, props)));
  try {
    await render();
    const retired = view.ensureVisible;
    await act(() =>
      assert.equal(view.ensureVisible(["missing", "m700"]), true),
    );
    assert.equal(view.entries.length, 40);
    assert.ok(view.entries.some((e) => e.message.id === "m700"));
    const anchor = view.entries[0];
    await act(() => assert.equal(view.ensureVisible(["collapsed"]), false));
    assert.equal(view.entries[0], anchor);
    await render({ target: "m999" });
    await act(() => assert.equal(view.ensureVisible(["m1"]), false));
    assert.equal(view.entries.at(-1).message.id, "m999");
    await render({ pending: true });
    assert.equal(view.ensureVisible(["m1"]), false);
    await render({ enabled: false });
    assert.equal(view.ensureVisible(["m1"]), false);
    await render({ scope: "b" });
    assert.equal(retired(["m700"]), false);
    await render({ scope: "a" });
    assert.equal(
      retired(["m700"]),
      false,
      "returning to the same scope cannot revive a retired visit",
    );
    const afterUnmount = view.ensureVisible;
    await act(() => root.unmount());
    assert.equal(afterUnmount(["m700"]), false);
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  useThreadReplyRenderWindow,
  useThreadRowWindow,
} from "./useThreadRowWindow.ts";
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

test("the first committed Back window contains the exact previous reading row", async () => {
  const entries = Array.from({ length: 66 }, (_, index) => ({
    message: { id: `m${index}` },
    summary: null,
  }));
  const root = createRoot(document.createElement("div"));
  const committed = [];
  function Harness({ target }) {
    const rowWindow = useThreadRowWindow(
      entries,
      "a",
      true,
      false,
      undefined,
      target,
    );
    const replies = useThreadReplyRenderWindow(rowWindow.entries, target);
    React.useLayoutEffect(() => {
      committed.push({ target, ids: replies.map((entry) => entry.message.id) });
    }, [replies, target]);
    return null;
  }
  const render = (target) =>
    act(() => root.render(React.createElement(Harness, { target })));
  try {
    await render(null);
    assert.ok(committed.at(-1).ids.includes("m13"));
    await render("m65");
    assert.ok(committed.at(-1).ids.includes("m65"));
    assert.ok(!committed.at(-1).ids.includes("m13"));
    committed.length = 0;
    await render("m13");
    assert.equal(committed[0].target, "m13");
    assert.equal(committed[0].ids.length, 40);
    assert.ok(committed[0].ids.includes("m13"));
    assert.ok(!committed[0].ids.includes("m65"));
  } finally {
    await act(() => root.unmount());
  }
});

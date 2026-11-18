import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceFocusCycle } from "./workspaceFocusCycle.ts";

test("shell focus cycling retains live controls, falls back after retirement and skips compact-hidden panes", () => {
  const scope = document.createElement("div");
  scope.innerHTML = `
    <button data-sidebar="trigger" id="trigger">Sidebar</button>
    <aside data-sidebar="sidebar"><button id="sidebar">Conversation</button></aside>
    <main>
      <section data-layout-view="a"><button aria-label="Conversation pane options" id="ha">A</button><input id="a"></section>
      <section data-layout-view="b"><div inert aria-hidden="true"><button aria-label="Conversation pane options" id="covered-header">Covered main header</button></div><button aria-label="Conversation pane options" id="hb">Visible drawer header</button><input id="b"></section>
    </main>`;
  document.body.append(scope);
  const workspace = scope.querySelector("main");
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const originalFocus = document.hasFocus;
  const visibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  HTMLElement.prototype.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 300,
    bottom: 400,
    width: 300,
    height: 400,
  });
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  let enabled = true,
    focused = "a";
  const cycle = createWorkspaceFocusCycle({
    scope,
    workspace,
    enabled: () => enabled,
    panes: () => [
      { paneId: "pa", viewId: "a" },
      { paneId: "pb", viewId: "b" },
    ],
    focusedViewId: () => focused,
    focusView: (id) => {
      focused = id;
      return true;
    },
  });
  const node = (id) => scope.querySelector(`#${id}`);
  try {
    const a = node("a"),
      b = node("b");
    a.value = "Keep draft";
    a.focus();
    node("trigger").focus();
    assert.equal(cycle.cycle(1, node("trigger")), true);
    assert.equal(
      document.activeElement,
      a,
      "the global sidebar trigger belongs to the sidebar region",
    );
    assert.equal(cycle.cycle(1, a), true);
    assert.equal(document.activeElement, node("hb"));
    assert.notEqual(document.activeElement, node("covered-header"));
    assert.equal(focused, "b");
    b.focus();
    assert.equal(cycle.cycle(1, b), true);
    assert.equal(document.activeElement, node("sidebar"));
    assert.equal(cycle.cycle(1, document.activeElement), true);
    assert.equal(document.activeElement, a);
    assert.equal(a.value, "Keep draft");
    a.remove();
    assert.equal(cycle.cycle(1, document.activeElement), true);
    assert.equal(document.activeElement, b);
    assert.equal(cycle.cycle(-1, b), true);
    assert.equal(document.activeElement, node("ha"));
    scope.querySelector('[data-layout-view="b"]').hidden = true;
    assert.equal(cycle.cycle(1, node("ha")), true);
    assert.equal(document.activeElement, node("sidebar"));
    assert.equal(cycle.cycle(-1, node("sidebar")), true);
    assert.equal(document.activeElement, node("ha"));
    scope.querySelector("aside").hidden = true;
    assert.equal(cycle.cycle(1, node("ha")), true);
    assert.equal(document.activeElement, node("trigger"));
    assert.equal(
      focused,
      "a",
      "collapsed-sidebar trigger does not activate another pane",
    );
    enabled = false;
    assert.equal(cycle.cycle(1, node("trigger")), false);
    assert.equal(document.activeElement, node("trigger"));
    enabled = true;
    cycle.dispose();
    assert.equal(cycle.cycle(1, node("trigger")), false);
  } finally {
    cycle.dispose();
    scope.remove();
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    document.hasFocus = originalFocus;
    if (visibility)
      Object.defineProperty(document, "visibilityState", visibility);
    else delete document.visibilityState;
  }
});

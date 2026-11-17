import assert from "node:assert/strict";
import test from "node:test";
import {
  createConversationView,
  createSingleLayout,
  splitPane,
  listPanes,
  closePane,
  swapPanes,
  navigateView,
  updateViewPresentation,
  normalizeSizes,
  resizeGroup,
} from "./model.ts";
import {
  canSplit,
  resolveDropEdge,
  clampDividerRatio,
  minimumSize,
} from "./geometry.ts";

function setup() {
  let sequence = 0;
  const ids = (kind) => `${kind}-${++sequence}`;
  const view = createConversationView("same-chat", ids);
  return { ids, view, initial: createSingleLayout(view, ids) };
}

test("duplicate chat split has fresh instance and independent copied presentation, capped at two", () => {
  const { ids, view, initial } = setup();
  view.panelState.thread = "root-a";
  const duplicate = createConversationView(view.channelId, ids, view);
  const next = splitPane(
    initial,
    initial.root.id,
    duplicate,
    "horizontal",
    ids,
  );
  assert.equal(listPanes(next.root).length, 2);
  assert.notEqual(view.id, duplicate.id);
  duplicate.panelState.thread = "root-b";
  assert.equal(view.panelState.thread, "root-a");
  assert.equal(initial.root.kind, "pane");
  assert.equal(
    splitPane(
      next,
      next.focusedPaneId,
      createConversationView("third", ids),
      "vertical",
      ids,
    ),
    next,
  );
});

test("recursive topology supports later tiling, closes collapse groups and final pane survives", () => {
  const { ids, initial } = setup();
  const two = splitPane(
    initial,
    initial.root.id,
    createConversationView("b", ids),
    "horizontal",
    ids,
  );
  const three = splitPane(
    two,
    two.focusedPaneId,
    createConversationView("c", ids),
    "vertical",
    ids,
    3,
  );
  assert.equal(listPanes(three.root).length, 3);
  assert.deepEqual(minimumSize(three.root), { width: 728, height: 568 });
  const closed = closePane(three, three.focusedPaneId);
  assert.equal(listPanes(closed.root).length, 2);
  assert.equal(closed.root.children[1].kind, "pane");
  const one = closePane(closed, closed.focusedPaneId);
  assert.equal(one.root.kind, "pane");
  assert.equal(closePane(one, one.focusedPaneId), one);
});

test("swap carries instance state and focus without changing geometry; close preserves sibling view", () => {
  const { ids, initial } = setup();
  const two = splitPane(
    initial,
    initial.root.id,
    createConversationView("b", ids),
    "horizontal",
    ids,
  );
  const [a, b] = listPanes(two.root);
  const swapped = swapPanes(two, a.id, b.id);
  assert.equal(swapped.focusedPaneId, a.id);
  assert.equal(swapped.root.children[0].viewInstanceId, b.viewInstanceId);
  assert.equal(swapped.views, two.views);
  const closed = closePane(swapped, b.id);
  assert.equal(closed.views[b.viewInstanceId], two.views[b.viewInstanceId]);
  assert.equal(closed.views[a.viewInstanceId], undefined);
});

test("replacement fences stale callbacks and excludes command state; anchors are copied", () => {
  const { view, initial } = setup();
  const next = navigateView(initial, view.id, "replacement", {
    panelState: { thread: "new", autoSend: "unsafe" },
    timelineAnchor: null,
    threadAnchor: null,
  });
  assert.equal(next.views[view.id].panelState.autoSend, undefined);
  assert.equal(
    updateViewPresentation(next, view.id, "same-chat", {
      panelState: { thread: "old" },
    }),
    next,
  );
  const anchor = { messageId: "m", offset: 2 };
  const updated = updateViewPresentation(next, view.id, "replacement", {
    timelineAnchor: anchor,
  });
  anchor.offset = 99;
  assert.equal(updated.views[view.id].timelineAnchor.offset, 2);
});

test("normalization handles invalid, overflow and underflow weights and resize preserves instances", () => {
  for (const values of [
    [NaN, -1],
    [Number.MAX_VALUE, Number.MAX_VALUE],
    [Number.MIN_VALUE, Number.MAX_VALUE],
  ]) {
    const normalized = normalizeSizes(values, 2);
    assert.ok(normalized.every((value) => Number.isFinite(value) && value > 0));
    assert.ok(Math.abs(normalized.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  }
  const { ids, initial } = setup();
  const two = splitPane(
    initial,
    initial.root.id,
    createConversationView("b", ids),
    "horizontal",
    ids,
  );
  const resized = resizeGroup(two, two.root.id, [1, 3]);
  assert.deepEqual(resized.root.sizes, [0.25, 0.75]);
  assert.equal(resized.views, two.views);
  assert.equal(resized.root.children[0], two.root.children[0]);
});

test("geometry uses content minima, mobile compact admission and stable normalized corner distances", () => {
  assert.equal(canSplit({ width: 728, height: 280 }, "horizontal", 1024), true);
  assert.equal(
    canSplit({ width: 727, height: 280 }, "horizontal", 1024),
    false,
  );
  assert.equal(canSplit({ width: 360, height: 568 }, "vertical", 768), true);
  assert.equal(canSplit({ width: 360, height: 567 }, "vertical", 1024), false);
  assert.equal(
    canSplit({ width: 1000, height: 1000 }, "horizontal", 767),
    false,
  );
  const rect = { left: 10, top: 20, width: 800, height: 400 };
  assert.equal(resolveDropEdge(rect, { x: 790, y: 410 }), "right");
  assert.equal(resolveDropEdge(rect, { x: 790, y: 419 }), "bottom");
  assert.equal(resolveDropEdge(rect, { x: 811, y: 419 }), null);
  assert.equal(resolveDropEdge(rect, { x: 400, y: 200 }), null);
  assert.equal(clampDividerRatio(0.1, 1008, 360, 360), 0.36);
  assert.equal(clampDividerRatio(0.9, 1008, 360, 360), 0.64);
  assert.equal(clampDividerRatio(0.5, 727, 360, 360), null);
});


test("navigation and fresh duplicate copy explicit preferences without sharing mutable state", () => {
  const {initial: layout, ids} = setup();
  const viewId = Object.keys(layout.views)[0];
  const changed = updateViewPresentation(layout, viewId, "same-chat", {
    preferences: {timelineMode:"timeline",threadMode:"focus",preferredThreadWidth:600},
  });
  const duplicate = createConversationView("same-chat", ids, changed.views[viewId]);
  duplicate.preferences.timelineMode = "threads";
  assert.equal(changed.views[viewId].preferences.timelineMode, "timeline");
  const outgoing = changed.views[viewId];
  const away = navigateView(changed, viewId, "dm");
  assert.equal(away.views[viewId].preferences, undefined);
  const returned = navigateView(away, viewId, "same-chat", outgoing);
  returned.views[viewId].preferences.preferredThreadWidth = 700;
  assert.equal(outgoing.preferences.preferredThreadWidth, 600);
});

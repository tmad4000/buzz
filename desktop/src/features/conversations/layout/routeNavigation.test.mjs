import assert from "node:assert/strict";
import test from "node:test";
import { ConversationLayoutController } from "./controller.ts";
import { listPanes } from "./model.ts";

function setup() {
  let n = 0;
  const denied = new Set();
  const controller = new ConversationLayoutController({
    scope: { communityId: "c", identityPubkey: "i", windowSlot: "w" },
    initialChannelId: "chat",
    storage: { getItem: () => null, setItem: () => {} },
    isCurrentScope: () => true,
    canOpen: (id) => id === "chat" || id === "dm",
    canLeave: (view) => !denied.has(view.id),
    ids: (kind) => `${kind}-${++n}`,
  });
  controller.open(
    controller.getSnapshot().layout.root.id,
    "dm",
    "horizontal",
    { width: 1000, height: 800 },
    1440,
  );
  const panes = listPanes(controller.getSnapshot().layout.root);
  const [a, b] = panes.map((pane) => pane.viewInstanceId);
  const route = (channelId, intent, extra = {}) =>
    controller.navigateRoute({
      channelId,
      intent,
      visibleViewIds: new Set([a, b]),
      recentViewIds: [b, a],
      ...extra,
    });
  return { controller, denied, panes, a, b, route };
}

test("external route applies to the visible matching instance without changing sibling presentation", () => {
  const { controller, a, b, route } = setup();
  try {
    controller.update(b, "dm", controller.visitToken(b), {
      panelState: { thread: "sibling" },
    });
    const sibling = controller.getSnapshot().layout.views[b];
    assert.equal(
      route(
        "chat",
        { kind: "external", channelId: "chat" },
        {
          presentation: {
            panelState: { thread: "deep-link" },
            timelineAnchor: null,
            threadAnchor: null,
          },
        },
      ),
      a,
    );
    const layout = controller.getSnapshot().layout;
    assert.equal(layout.views[a].panelState.thread, "deep-link");
    assert.equal(layout.views[b], sibling);
    assert.equal(route("chat", { kind: "sidebar" }), a);
  } finally {
    controller.dispose();
  }
});

test("sidebar replaces the active DM even when its destination is already visible", () => {
  const { controller, a, b, route } = setup();
  try {
    const sibling = controller.getSnapshot().layout.views[a];
    assert.equal(route("chat", { kind: "sidebar" }), b);
    const layout = controller.getSnapshot().layout;
    assert.equal(layout.views[b].channelId, "chat");
    assert.equal(layout.views[a], sibling);
    assert.equal(listPanes(layout.root).length, 2);
  } finally {
    controller.dispose();
  }
});

test("target veto and unauthorized or inconsistent routes leave layout and visit unchanged", () => {
  const { controller, denied, a, route } = setup();
  try {
    denied.add(a);
    const before = controller.getSnapshot();
    const visit = controller.visitToken(a);
    assert.equal(route("chat", { kind: "external", channelId: "chat" }), null);
    assert.equal(controller.getSnapshot(), before);
    assert.equal(controller.visitToken(a), visit);
    assert.equal(route("forbidden", { kind: "sidebar" }), null);
    assert.equal(route("dm", { kind: "external", channelId: "chat" }), null);
    assert.equal(controller.getSnapshot(), before);
  } finally {
    controller.dispose();
  }
});

test("closed history target falls back to active view without restoring the split", () => {
  const { controller, panes, b, route } = setup();
  try {
    controller.close(panes[0].id);
    assert.equal(
      route("chat", { kind: "history", viewInstanceId: "closed" }),
      b,
    );
    assert.equal(listPanes(controller.getSnapshot().layout.root).length, 1);
    assert.equal(controller.getSnapshot().layout.views[b].channelId, "chat");
  } finally {
    controller.dispose();
  }
});

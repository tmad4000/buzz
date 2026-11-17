import assert from "node:assert/strict";
import test from "node:test";
import { ConversationLayoutController } from "./controller.ts";
import { bindVisitPreferences } from "./visitPreferences.ts";
import { listPanes } from "./model.ts";
import { layoutStorageKey } from "./storage.ts";
import { visitCacheStorageKey } from "./visitCacheStorage.ts";

const bounds = { width: 1000, height: 800 };
const scope = {
  communityId: "community",
  identityPubkey: "identity",
  windowSlot: "main",
};
function setup(overrides = {}) {
  let n = 0;
  let current = true;
  const entries = new Map();
  const writes = [];
  const leaves = [];
  const options = {
    scope,
    initialChannelId: "chat",
    ids: (kind) => `${kind}-${++n}`,
    storage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => {
        writes.push(key);
        entries.set(key, value);
      },
    },
    isCurrentScope: () => current,
    canOpen: (id) => id === "chat" || id === "dm",
    canLeave: (view) => {
      leaves.push(view.id);
      return true;
    },
    ...overrides,
  };
  const controller = new ConversationLayoutController(options);
  return {
    controller,
    options,
    entries,
    writes,
    leaves,
    invalidate: () => {
      current = false;
    },
  };
}
const panes = (controller) => listPanes(controller.getSnapshot().layout.root);
const split = (controller) =>
  controller.open(panes(controller)[0].id, "chat", "horizontal", bounds, 1440);

test("Restore split remembers the outgoing chat and retires its callbacks", () => {
  const { controller } = setup();
  split(controller);
  const [a, b] = panes(controller);
  controller.close(b.id);
  controller.navigate(a.viewInstanceId, "dm");
  const oldVisit = controller.visitToken(a.viewInstanceId);
  controller.update(a.viewInstanceId, "dm", oldVisit, {
    panelState: { thread: "latest-dm-thread" },
    timelineAnchor: { messageId: "latest-dm-anchor", offset: 42 },
  });
  assert.equal(controller.restore(), true);
  assert.notEqual(controller.visitToken(a.viewInstanceId), oldVisit);
  controller.navigate(a.viewInstanceId, "dm");
  const view = controller.getSnapshot().layout.views[a.viewInstanceId];
  assert.equal(view.panelState.thread, "latest-dm-thread");
  assert.deepEqual(view.timelineAnchor, {
    messageId: "latest-dm-anchor",
    offset: 42,
  });
  assert.equal(
    controller.update(a.viewInstanceId, "dm", oldVisit, {
      panelState: { thread: "stale" },
    }),
    false,
  );
  controller.dispose();
});

test("scoped visit cache survives controller reconstruction independently of canonical drafts", () => {
  const first = setup();
  const id = panes(first.controller)[0].viewInstanceId;
  first.controller.update(id, "chat", first.controller.visitToken(id), {
    panelState: { thread: "remembered-root" },
    threadAnchor: { messageId: "reply", offset: 17 },
  });
  first.controller.navigate(id, "dm");
  first.controller.dispose();
  const saved = new Map(first.entries);
  saved.set("unrelated-draft", "keep this draft");
  const second = setup({
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    },
  });
  assert.equal(
    second.controller.getSnapshot().layout.views[id].channelId,
    "dm",
  );
  second.controller.navigate(id, "chat");
  const restored = second.controller.getSnapshot().layout.views[id];
  assert.equal(restored.panelState.thread, "remembered-root");
  assert.deepEqual(restored.threadAnchor, { messageId: "reply", offset: 17 });
  assert.equal(saved.get("unrelated-draft"), "keep this draft");
  const other = setup({
    scope: { ...scope, identityPubkey: "other" },
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    },
  });
  assert.deepEqual(
    Object.values(other.controller.getSnapshot().layout.views)[0].panelState,
    {},
  );
  other.controller.dispose();
  second.controller.dispose();
});

test("corrupt cache backup precedes replacement and cache quota failure keeps live navigation", () => {
  const fixture = setup();
  const key = visitCacheStorageKey(scope);
  fixture.entries.set(key, "{broken cache");
  const id = panes(fixture.controller)[0].viewInstanceId;
  fixture.controller.navigate(id, "dm");
  assert.equal(fixture.entries.get(`${key}:recovery`), "{broken cache");
  assert.ok(
    fixture.writes.indexOf(`${key}:recovery`) < fixture.writes.indexOf(key),
  );
  const failing = setup({
    storage: {
      getItem: () => null,
      setItem: (entry) => {
        if (entry.endsWith(":visits")) throw new Error("cache quota");
      },
    },
  });
  const failedId = panes(failing.controller)[0].viewInstanceId;
  assert.equal(failing.controller.navigate(failedId, "dm"), true);
  assert.equal(
    failing.controller.getSnapshot().message,
    "Layout saved for this session only.",
  );
  assert.equal(failing.controller.navigate(failedId, "chat"), true);
  fixture.controller.dispose();
  failing.controller.dispose();
});

test("returning to a chat restores only that view's latest presentation", () => {
  const { controller } = setup();
  const a = panes(controller)[0].viewInstanceId;
  const update = (view, channel, patch) =>
    controller.update(view, channel, controller.visitToken(view), patch);
  update(a, "chat", {
    panelState: { thread: "root-a" },
    timelineAnchor: { messageId: "message-a", offset: 42 },
  });
  split(controller);
  const b = panes(controller)[1].viewInstanceId;
  update(b, "chat", { panelState: { thread: "root-b" } });
  controller.navigate(a, "dm");
  update(a, "dm", { panelState: { thread: "dm-root" } });
  controller.navigate(a, "chat");
  let views = controller.getSnapshot().layout.views;
  assert.equal(views[a].panelState.thread, "root-a");
  assert.deepEqual(views[a].timelineAnchor, {
    messageId: "message-a",
    offset: 42,
  });
  assert.equal(views[b].panelState.thread, "root-b");
  controller.navigate(b, "dm");
  controller.navigate(b, "chat");
  views = controller.getSnapshot().layout.views;
  assert.equal(views[b].panelState.thread, "root-b");
  controller.navigate(a, "dm");
  assert.equal(
    controller.getSnapshot().layout.views[a].panelState.thread,
    "dm-root",
  );
  controller.dispose();
});

test("visit recency keeps twenty chats including the active one and never changes on veto", () => {
  let allowed = true;
  const { controller } = setup({
    canOpen: () => true,
    canLeave: () => allowed,
  });
  const id = panes(controller)[0].viewInstanceId;
  const remember = (channel) => {
    controller.navigate(id, channel);
    controller.update(id, channel, controller.visitToken(id), {
      panelState: { thread: `root-${channel}` },
    });
  };
  for (let index = 0; index < 20; index++) remember(`chat-${index}`);
  allowed = false;
  const before = controller.getSnapshot();
  assert.equal(controller.navigate(id, "denied"), false);
  assert.equal(controller.getSnapshot(), before);
  allowed = true;
  controller.navigate(id, "chat-0");
  assert.equal(
    controller.getSnapshot().layout.views[id].panelState.thread,
    "root-chat-0",
  );
  remember("chat-20");
  controller.navigate(id, "chat-0");
  assert.equal(
    controller.getSnapshot().layout.views[id].panelState.thread,
    "root-chat-0",
  );
  controller.navigate(id, "chat-1");
  assert.deepEqual(controller.getSnapshot().layout.views[id].panelState, {});
  controller.dispose();
});

test("explicit route presentation overrides remembered state and cannot alias caller objects", () => {
  const { controller } = setup();
  const id = panes(controller)[0].viewInstanceId;
  const presentation = {
    panelState: { thread: "explicit", autoSend: "never" },
    timelineAnchor: { messageId: "target", offset: 7 },
    threadAnchor: null,
  };
  controller.navigate(id, "dm", presentation);
  presentation.panelState.thread = "changed";
  presentation.timelineAnchor.offset = 999;
  controller.navigate(id, "chat");
  controller.navigate(id, "dm");
  const view = controller.getSnapshot().layout.views[id];
  assert.equal(view.panelState.thread, "explicit");
  assert.equal(view.panelState.autoSend, undefined);
  assert.equal(view.timelineAnchor.offset, 7);
  controller.dispose();
});

test("authorized admission precedes storage reads; saved inaccessible chats remain placeholders", () => {
  let reads = 0;
  assert.throws(() =>
    setup({
      isCurrentScope: () => false,
      storage: {
        getItem() {
          reads++;
        },
        setItem() {},
      },
    }),
  );
  assert.equal(reads, 0);
  const first = setup();
  split(first.controller);
  const saved = first.entries.get(layoutStorageKey(scope));
  const second = setup({
    canOpen: (id) => id === "dm",
    initialChannelId: "dm",
    storage: { getItem: () => saved, setItem() {} },
  });
  assert.equal(panes(second.controller).length, 2);
  assert.equal(
    second.controller.getSnapshot().layout.views[
      panes(second.controller)[0].viewInstanceId
    ].channelId,
    "chat",
  );
});

test("same chat opens fresh view with copied presentation; capacity replaces guarded target", () => {
  const { controller, leaves } = setup();
  const a = panes(controller)[0];
  controller.update(
    a.viewInstanceId,
    "chat",
    controller.visitToken(a.viewInstanceId),
    { panelState: { thread: "root-a" } },
  );
  assert.equal(split(controller), true);
  const [, b] = panes(controller);
  assert.notEqual(a.viewInstanceId, b.viewInstanceId);
  assert.equal(
    controller.getSnapshot().layout.views[b.viewInstanceId].panelState.thread,
    "root-a",
  );
  assert.deepEqual(leaves, []);
  assert.equal(controller.open(b.id, "dm", "vertical", bounds, 1440), true);
  assert.deepEqual(leaves, [b.viewInstanceId]);
  assert.equal(panes(controller).length, 2);
  assert.deepEqual(
    controller.getSnapshot().layout.views[b.viewInstanceId].panelState,
    {},
  );
  assert.equal(
    controller.getSnapshot().layout.views[a.viewInstanceId].panelState.thread,
    "root-a",
  );
  controller.dispose();
});

test("background close/replace use target guard; blocked operation changes no state or storage", () => {
  const { controller, writes } = setup({ canLeave: () => false });
  split(controller);
  const a = panes(controller)[0];
  const before = controller.getSnapshot();
  const count = writes.length;
  assert.equal(controller.close(a.id), false);
  assert.equal(controller.navigate(a.viewInstanceId, "dm"), false);
  assert.equal(controller.getSnapshot(), before);
  assert.equal(writes.length, count);
  assert.equal(
    controller.open(a.id, "forum", "horizontal", bounds, 1440),
    false,
  );
  controller.dispose();
});

test("guard dialog reentrancy and scope changes fence old operations, callbacks and writes", () => {
  let fixture;
  fixture = setup({
    canLeave: () => {
      fixture.invalidate();
      return true;
    },
  });
  split(fixture.controller);
  const a = panes(fixture.controller)[0];
  const before = fixture.controller.getSnapshot();
  const writes = fixture.writes.length;
  assert.equal(fixture.controller.navigate(a.viewInstanceId, "dm"), false);
  assert.equal(fixture.controller.close(a.id), false);
  assert.equal(
    fixture.controller.update(a.viewInstanceId, "chat", 0, {
      panelState: { thread: "late" },
    }),
    false,
  );
  fixture.controller.dispose();
  assert.equal(fixture.controller.getSnapshot(), before);
  assert.equal(fixture.writes.length, writes);
  let reentrant;
  reentrant = setup({
    canLeave: () => {
      reentrant.controller.focus(panes(reentrant.controller)[0].id);
      return true;
    },
  });
  split(reentrant.controller);
  assert.equal(
    reentrant.controller.navigate(
      panes(reentrant.controller)[1].viewInstanceId,
      "dm",
    ),
    false,
  );
  reentrant.controller.dispose();
});

test("visit token rejects old A callback after A to B to A navigation", () => {
  const { controller } = setup();
  const a = panes(controller)[0];
  const token = controller.visitToken(a.viewInstanceId);
  controller.navigate(a.viewInstanceId, "dm");
  controller.navigate(a.viewInstanceId, "chat");
  assert.equal(
    controller.update(a.viewInstanceId, "chat", token, {
      panelState: { thread: "stale" },
    }),
    false,
  );
  assert.equal(
    controller.update(
      a.viewInstanceId,
      "chat",
      controller.visitToken(a.viewInstanceId),
      { panelState: { thread: "current" } },
    ),
    true,
  );
  controller.dispose();
});

test("Close split retains chosen instance and restore preserves its latest presentation/ratio", () => {
  const { controller, leaves } = setup();
  split(controller);
  const [a, b] = panes(controller);
  const root = controller.getSnapshot().layout.root;
  controller.resize(root.id, [0.4, 0.6], true);
  assert.equal(controller.close(a.id, true), true);
  assert.deepEqual(leaves, [b.viewInstanceId]);
  assert.equal(panes(controller)[0].viewInstanceId, a.viewInstanceId);
  controller.update(
    a.viewInstanceId,
    "chat",
    controller.visitToken(a.viewInstanceId),
    { panelState: { thread: "new" } },
  );
  assert.equal(controller.getSnapshot().canRestore, true);
  assert.equal(controller.restore(), true);
  assert.deepEqual(controller.getSnapshot().layout.root.sizes, [0.4, 0.6]);
  assert.equal(
    controller.getSnapshot().layout.views[a.viewInstanceId].panelState.thread,
    "new",
  );
  assert.equal(controller.getSnapshot().canRestore, false);
  assert.equal(controller.close(a.id), true);
  assert.equal(controller.close(b.id), false);
  controller.dispose();
});

test("resize final commit flushes identical last ratio; compact feasibility never overwrites tree", () => {
  const { controller, writes } = setup({ saveDelayMs: 10000 });
  split(controller);
  const root = controller.getSnapshot().layout.root;
  const count = writes.length;
  controller.resize(root.id, [0.3, 0.7], false);
  controller.resize(root.id, [0.35, 0.65], false);
  assert.equal(writes.length, count);
  controller.resize(root.id, [0.35, 0.65], true);
  assert.equal(writes.length, count + 1);
  const before = controller.getSnapshot();
  assert.equal(
    controller.orient("vertical", { width: 390, height: 800 }, 390),
    false,
  );
  assert.equal(controller.getSnapshot(), before);
  controller.dispose();
});

test("corrupt backup precedes replacement, quota failure keeps session layout and scope immutable", () => {
  const mutableScope = { ...scope };
  const fixture = setup({ scope: mutableScope });
  fixture.entries.set(layoutStorageKey(scope), "{corrupt");
  mutableScope.identityPubkey = "other";
  split(fixture.controller);
  assert.deepEqual(fixture.writes, [
    `${layoutStorageKey(scope)}:recovery`,
    layoutStorageKey(scope),
  ]);
  const failed = setup({
    storage: {
      getItem: () => "{corrupt",
      setItem() {
        throw new Error("quota");
      },
    },
  });
  assert.equal(failed.controller.getSnapshot().recovery, "recoverable");
  assert.equal(split(failed.controller), true);
  assert.equal(panes(failed.controller).length, 2);
  assert.equal(
    failed.controller.getSnapshot().message,
    "Layout saved for this session only.",
  );
  failed.controller.dispose();
  fixture.controller.dispose();
});

test("debounce persists the latest ratio once; disposal flushes once and rejects later actions", async () => {
  const { controller, writes } = setup({ saveDelayMs: 5 });
  split(controller);
  const root = controller.getSnapshot().layout.root;
  const count = writes.length;
  controller.resize(root.id, [0.4, 0.6], false);
  controller.resize(root.id, [0.45, 0.55], false);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(writes.length, count + 1);
  controller.resize(root.id, [0.5, 0.5], false);
  controller.dispose();
  assert.equal(writes.length, count + 2);
  assert.equal(controller.focus(panes(controller)[0].id), false);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(writes.length, count + 2);
});

test("bound view preferences merge simultaneous choices and reject retired visit callbacks", () => {
  const { controller } = setup();
  const first = Object.values(controller.getSnapshot().layout.views)[0];
  const bound = bindVisitPreferences(controller, first);
  bound.onTimelineModeChange("timeline");
  bound.onThreadViewModeChange("focus");
  bound.onThreadPanelWidthChange(650);
  assert.deepEqual(
    controller.getSnapshot().layout.views[first.id].preferences,
    {
      timelineMode: "timeline",
      threadMode: "focus",
      preferredThreadWidth: 650,
    },
  );
  assert.equal(controller.navigate(first.id, "dm"), true);
  bound.onThreadPanelWidthChange(900);
  assert.equal(
    controller.getSnapshot().layout.views[first.id].preferences,
    undefined,
  );
  assert.equal(controller.navigate(first.id, "chat"), true);
  const returned = controller.getSnapshot().layout.views[first.id];
  assert.deepEqual(returned.preferences, {
    timelineMode: "timeline",
    threadMode: "focus",
    preferredThreadWidth: 650,
  });
  assert.notEqual(
    bindVisitPreferences(controller, returned).presentationVisitKey,
    bound.presentationVisitKey,
  );
  bound.onThreadViewModeChange("split");
  assert.equal(
    controller.getSnapshot().layout.views[first.id].preferences.threadMode,
    "focus",
  );
  controller.dispose();
});

test("legacy expansion ownership remains with the first view and is never reassigned after close", () => {
  const { controller } = setup();
  const first = Object.values(controller.getSnapshot().layout.views)[0];
  assert.equal(first.legacyExpansionOwner, true);
  split(controller);
  const second = Object.values(controller.getSnapshot().layout.views).find(
    (view) => view.id !== first.id,
  );
  assert.equal(second.legacyExpansionOwner, false);
  const firstPane = panes(controller).find(
    (pane) => pane.viewInstanceId === first.id,
  );
  assert.equal(controller.close(firstPane.id), true);
  const remaining = Object.values(controller.getSnapshot().layout.views)[0];
  assert.equal(remaining.legacyExpansionOwner, false);
  assert.equal(controller.navigate(remaining.id, "dm"), true);
  assert.equal(
    controller.getSnapshot().layout.views[remaining.id].legacyExpansionOwner,
    false,
  );
  controller.dispose();
});

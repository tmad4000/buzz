import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useUnreadSidebarThread } from "./useUnreadSidebarThread.ts";

const msg = (id, parentId = null) => ({
  id,
  parentId,
  rootId: "root",
  createdAt: 1,
  depth: 0,
  body: id,
  author: "Nora",
  time: "now",
});
const messages = [msg("root"), msg("branch", "root"), msg("leaf", "branch")];
let latest;
const suspended = new Promise(() => {});
function Harness(props) {
  const view = useUnreadSidebarThread(props);
  latest = view;
  if (props.suspend) throw suspended;
  return React.createElement(
    "div",
    null,
    React.createElement(
      "button",
      {
        "data-testid": "toggle-branch",
        type: "button",
        onClick: () => view.toggle(messages[1]),
      },
      "Toggle branch",
    ),
    ...view.entries.map(({ message }) =>
      React.createElement("span", { key: message.id }, message.id),
    ),
  );
}
const base = {
  enabled: true,
  channelId: "channel-a",
  currentPubkey: "identity-a",
  root: "root",
  messages,
  isUnread: (id) => id === "leaf",
  scrollTargetId: null,
};
function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    render: async (props = base, transition = false) =>
      act(async () => {
        const update = () =>
          root.render(
            React.createElement(
              React.Suspense,
              { fallback: React.createElement("div", null, "Loading") },
              React.createElement(Harness, props),
            ),
          );
        if (transition) React.startTransition(update);
        else update();
      }),
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("explicit expansion survives navigation and a fresh hook instance; collapse wins over new unread", async () => {
  localStorage.clear();
  let app = mount();
  await app.render();
  assert.ok(latest.expanded.has("branch"), "first unread branch opens");
  await act(async () => latest.toggle(messages[1]));
  assert.equal(latest.expanded.has("branch"), false);
  const more = {
    ...base,
    messages: [...messages, msg("new", "branch")],
    isUnread: (id) => id === "leaf" || id === "new",
  };
  await app.render(more);
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "new unread cannot override a saved collapse",
  );
  await app.render({
    ...base,
    root: "other-root",
    messages: [msg("other-root")],
  });
  await app.render(more);
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "navigation restores collapse",
  );
  await act(async () => {
    latest.toggle(messages[1]);
    const saved = Object.keys(localStorage).filter((k) =>
      k.startsWith("buzz-thread-expansion.v1:"),
    );
    assert.ok(
      saved.some(
        (key) =>
          new Map(JSON.parse(localStorage.getItem(key))).get("branch") === true,
      ),
      "toggle persists before an immediate unmount",
    );
  });
  await app.close();
  app = mount();
  await app.render({ ...more, isUnread: () => false });
  assert.ok(
    latest.expanded.has("branch"),
    "restart restores expanded branch even after reading",
  );
  await app.close();
});

test("thread, channel, community and identity choices are isolated; seen read branches stay closed", async () => {
  localStorage.clear();
  const app = mount();
  await app.render({ ...base, isUnread: () => false });
  assert.equal(latest.expanded.has("root"), false);
  await app.render();
  assert.equal(
    latest.expanded.has("root"),
    false,
    "known read branch doesn't auto-open later",
  );
  await app.render({ ...base, channelId: "channel-b" });
  assert.ok(latest.expanded.has("root"));
  await act(async () => latest.toggle(messages[1]));
  await app.render({
    ...base,
    channelId: "channel-b",
    currentPubkey: "identity-b",
  });
  assert.ok(latest.expanded.has("branch"));
  await app.render({ ...base, channelId: "channel-b" });
  assert.equal(latest.expanded.has("branch"), false);
  await app.close();
  localStorage.setItem("buzz-active-community-id", "another-community");
  const another = mount();
  await another.render({ ...base, channelId: "channel-b" });
  assert.ok(latest.expanded.has("branch"));
  await another.close();
});

test("unknown unread state isn't saved as read; deep link waits for messages and permits later toggles", async () => {
  localStorage.clear();
  const app = mount();
  await app.render({ ...base, isUnread: undefined });
  await app.render();
  assert.ok(latest.expanded.has("branch"));
  await app.close();
  localStorage.clear();
  const linked = mount();
  await linked.render({
    ...base,
    messages: [],
    scrollTargetId: "leaf",
    isUnread: () => false,
  });
  await linked.render({
    ...base,
    scrollTargetId: "leaf",
    isUnread: () => false,
  });
  assert.ok(
    latest.expanded.has("branch"),
    "late-loaded deep link reveals ancestry",
  );
  await act(async () => latest.toggle(messages[1]));
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "same link does not override a later toggle",
  );
  await linked.render({
    ...base,
    scrollTargetId: "leaf",
    isUnread: () => false,
    pending: true,
  });
  await linked.render({
    ...base,
    scrollTargetId: "leaf",
    isUnread: () => false,
    pending: false,
  });
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "loading retry cannot replay a handled link over a toggle",
  );
  await linked.close();
});

test("partial ancestry waits for the full path; pending read state doesn't initialize defaults", async () => {
  localStorage.clear();
  const linked = mount();
  await linked.render({
    ...base,
    messages: [messages[0], messages[2]],
    scrollTargetId: "leaf",
    isUnread: () => false,
  });
  await linked.render({
    ...base,
    scrollTargetId: "leaf",
    isUnread: () => false,
  });
  assert.ok(latest.expanded.has("root"));
  assert.ok(latest.expanded.has("branch"));
  assert.ok(latest.entries.some(({ message }) => message.id === "leaf"));
  await linked.close();
  localStorage.clear();
  const pending = mount();
  await pending.render({ ...base, pending: true, isUnread: () => false });
  await pending.render({ ...base, pending: false });
  assert.ok(latest.expanded.has("branch"));
  await pending.close();
});
test("a suspended scope render cannot redirect the committed thread's toggle", async () => {
  localStorage.clear();
  const app = mount();
  await app.render();
  const aKey = Object.keys(localStorage).find((key) =>
    key.includes('"channel-a"'),
  );
  assert.ok(aKey);
  await app.render({ ...base, channelId: "channel-b", suspend: true }, true);
  await act(async () =>
    document.querySelector('[data-testid="toggle-branch"]').click(),
  );
  assert.equal(
    new Map(JSON.parse(localStorage.getItem(aKey))).get("branch"),
    false,
    "committed A receives its toggle",
  );
  assert.equal(
    Object.keys(localStorage).some((key) => key.includes('"channel-b"')),
    false,
    "uncommitted B never receives a write",
  );
  await app.close();
});

test("own defaults do not mistake historical hydration for a send; pending reveal survives ack/read and later collapse wins", async () => {
  localStorage.clear();
  const app = mount();
  const older = { ...msg("older", "branch"), pubkey: "identity-a" };
  const options = {
    ...base,
    initialMode: "collapsed",
    isUnread: () => false,
    complete: false,
  };
  await app.render({ ...options, messages: [...messages, older] });
  assert.ok(
    latest.expanded.has("branch"),
    "older own reply defaults open despite collapsed automatic policy",
  );
  await act(() => latest.setExpanded("root", false));
  const historical = {
    ...msg("history", "branch"),
    pubkey: "identity-a",
    createdAt: 0,
  };
  await app.render({ ...options, messages: [...messages, older, historical] });
  assert.equal(
    latest.expanded.has("root"),
    false,
    "history load cannot override explicit collapse",
  );
  const pending = {
    ...msg("optimistic-1", "branch"),
    renderKey: "local-1",
    pubkey: "identity-a",
    pending: true,
  };
  await app.render({
    ...options,
    messages: [...messages, older, historical, pending],
  });
  assert.ok(
    latest.entries.some((e) => e.message.id === pending.id),
    "actual local pending send exposes collapsed ancestor path",
  );
  const ack = { ...pending, id: "ack-1", pending: false };
  await app.render({
    ...options,
    messages: [...messages, older, historical, ack],
    isUnread: () => true,
  });
  await app.render({
    ...options,
    messages: [...messages, older, historical, ack],
    isUnread: () => false,
    complete: true,
  });
  assert.ok(
    latest.entries.some((e) => e.message.id === ack.id),
    "ack and read changes retain body visibility",
  );
  await act(() => latest.setExpanded("root", false));
  await app.render({
    ...options,
    messages: [...messages, older, historical, ack],
  });
  assert.equal(
    latest.expanded.has("root"),
    false,
    "later manual collapse is never replayed over",
  );
  await app.close();
});

test("explicit navigation reveals only this view and preserves saved collapsed ancestry", async () => {
  localStorage.clear();
  const views = {};
  function Host({ id, target = null, loaded = true, pending = false }) {
    views[id] = useUnreadSidebarThread({
      ...base,
      messages: [
        ...messages.filter((message) => loaded || message.id !== "leaf"),
        msg("other", "root"),
        msg("other-leaf", "other"),
      ],
      pending,
      isUnread: () => false,
      scrollTargetId: target,
    });
    return null;
  }
  const containers = [
    document.createElement("div"),
    document.createElement("div"),
  ];
  containers.forEach((node) => {
    document.body.append(node);
  });
  const roots = containers.map((node) => createRoot(node));
  const render = (index, target = null, loaded = true, pending = false) =>
    act(async () =>
      roots[index].render(
        React.createElement(Host, { id: index, target, loaded, pending }),
      ),
    );
  await render(0);
  await render(1);
  const before = JSON.stringify({ ...localStorage });
  const sibling = [...views[1].expanded];
  await render(0, "leaf");
  assert.ok(views[0].expanded.has("root"));
  assert.ok(views[0].expanded.has("branch"));
  assert.deepEqual(
    [...views[1].expanded],
    sibling,
    "sibling receives no preference/reveal broadcast",
  );
  assert.equal(
    JSON.stringify({ ...localStorage }),
    before,
    "navigation does not overwrite saved collapse",
  );
  await act(async () => views[1].setExpanded("other", true));
  assert.ok(
    views[0].expanded.has("branch"),
    "unrelated sibling preference change retains local reveal",
  );
  await render(0);
  assert.ok(
    views[0].expanded.has("branch"),
    "resolving scroll target keeps the local reveal open for reading",
  );
  await act(async () => views[0].toggle(messages[1]));
  assert.equal(
    views[0].expanded.has("branch"),
    false,
    "explicit collapse wins over transient reveal",
  );
  assert.ok(
    views[0].expanded.has("root"),
    "nested toggle must not collapse untouched transient ancestor",
  );
  await act(async () => roots[0].unmount());
  roots[0] = createRoot(containers[0]);
  await render(0);
  assert.equal(
    views[0].expanded.has("branch"),
    false,
    "new view restores saved collapse",
  );
  await act(async () => views[1].setExpanded("other", false));
  await render(0, "leaf", false, true);
  await act(async () => views[1].setExpanded("other", true));
  await render(0, "leaf", true, false);
  assert.ok(
    views[0].expanded.has("branch"),
    "unrelated sibling preferences do not cancel a pending reveal before history arrives",
  );
  await render(0);
  await act(async () => views[1].setExpanded("root", true));
  await render(0, "leaf", false, true);
  await act(async () => views[1].setExpanded("root", false));
  await render(0, "leaf", true, false);
  assert.equal(
    views[0].expanded.has("root"),
    false,
    "explicit sibling collapse cancels a pending related reveal",
  );
  await render(0);
  await act(async () => views[1].setExpanded("branch", true));
  await render(0, "leaf", false, true);
  await act(async () => views[1].setExpanded("branch", false));
  await render(0, "leaf", true, false);
  assert.equal(
    views[0].expanded.has("branch"),
    false,
    "late ancestry resolution honors a collapse received while the path was unknown",
  );
  await act(async () =>
    roots.forEach((root) => {
      root.unmount();
    }),
  );
  containers.forEach((node) => {
    node.remove();
  });
});

test("explicit choices follow original event IDs into a new presentation root and back after restart", async () => {
  localStorage.clear();
  let app = mount();
  await app.render();
  await act(async () => latest.toggle(messages[1]));
  assert.equal(latest.expanded.has("branch"), false);
  const moved = {
    ...base,
    root: "new-root",
    messages: [
      msg("new-root"),
      ...messages.map((message) => ({
        ...message,
        parentId: message.id === "root" ? "new-root" : message.parentId,
        rootId: "new-root",
        canonicalParentId: message.parentId,
        canonicalRootId: "root",
        ...(message.id === "root"
          ? { threadOrganization: { annotationId: "move", operation: "link" } }
          : {}),
      })),
    ],
  };
  await app.render(moved);
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "moving a branch preserves collapse",
  );
  await app.close();
  app = mount();
  await app.render(moved);
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "moved view survives restart",
  );
  await act(async () => latest.toggle(moved.messages[2]));
  assert.equal(latest.expanded.has("branch"), true);
  await app.render(base);
  assert.equal(
    latest.expanded.has("branch"),
    true,
    "explicit change in moved view follows original event on unlink",
  );
  await app.close();
});

test("toggle then depth-guide setExpanded collapse persists across restart and organization", async () => {
  localStorage.clear();
  let app = mount();
  await app.render();
  await act(async () => latest.toggle(messages[1]));
  await act(async () => latest.toggle(messages[1]));
  assert.equal(latest.expanded.has("branch"), true);
  await act(async () => latest.setExpanded("branch", false));
  assert.equal(latest.expanded.has("branch"), false);
  await app.close();
  app = mount();
  await app.render();
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "depth-guide collapse wins over older event-wide true",
  );
  const moved = {
    ...base,
    root: "new-root",
    messages: [
      msg("new-root"),
      ...messages.map((message) => ({
        ...message,
        parentId: message.id === "root" ? "new-root" : message.parentId,
        rootId: "new-root",
        canonicalParentId: message.parentId,
        canonicalRootId: "root",
        ...(message.id === "root"
          ? { threadOrganization: { annotationId: "move", operation: "link" } }
          : {}),
      })),
    ],
  };
  await app.render(moved);
  assert.equal(latest.expanded.has("branch"), false);
  await app.close();
  app = mount();
  await app.render(moved);
  assert.equal(
    latest.expanded.has("branch"),
    false,
    "same original branch remains collapsed after moving/restarting",
  );
  await app.render(base);
  assert.equal(latest.expanded.has("branch"), false);
  await app.close();
});

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

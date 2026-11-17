import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useUnreadSidebarThread } from "./useUnreadSidebarThread.ts";
import { threadExpansionKey } from "../lib/threadExpansionStorage.ts";
const message = (id, parentId = null) => ({
  id,
  parentId,
  rootId: "root",
  createdAt: 1,
  body: id,
  author: "Alex",
  time: "now",
  depth: 0,
});
const messages = [
  message("root"),
  message("branch", "root"),
  message("leaf", "branch"),
];
const base = {
  enabled: true,
  channelId: "a",
  currentPubkey: "me",
  root: "root",
  messages,
  isUnread: () => false,
  scrollTargetId: null,
  initialMode: "smart",
};
function setup() {
  const views = {};
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Harness({ name, options }) {
    views[name] = useUnreadSidebarThread(options);
    return null;
  }
  return {
    views,
    render: async (options = [base]) =>
      act(() =>
        root.render(
          React.createElement(
            React.Fragment,
            null,
            ...options.map((p, i) =>
              React.createElement(Harness, { key: i, name: i, options: p }),
            ),
          ),
        ),
      ),
    close: async () => {
      await act(() => root.unmount());
      node.remove();
    },
  };
}
test("Smart/Expanded automatic branches are ephemeral; changing defaults preserves current visit", async () => {
  localStorage.clear();
  const h = setup();
  try {
    await h.render();
    assert.equal(h.views[0].expanded.has("branch"), true);
    assert.equal(
      [...Array(localStorage.length)].some((_, i) =>
        localStorage.key(i).startsWith("buzz-thread-expansion.v1:"),
      ),
      false,
    );
    await h.render([{ ...base, initialMode: "collapsed" }]);
    assert.equal(
      h.views[0].expanded.has("branch"),
      true,
      "new defaults wait for next entry",
    );
    await act(() => h.views[0].toggle(messages[1]));
    assert.equal(h.views[0].expanded.has("branch"), false);
  } finally {
    await h.close();
  }
  const reopened = setup();
  try {
    await reopened.render([{ ...base, initialMode: "expanded" }]);
    assert.equal(
      reopened.views[0].expanded.has("branch"),
      false,
      "remembered collapse wins",
    );
  } finally {
    await reopened.close();
  }
});
test("Collapsed initializes missing branches closed; legacy v1 true and false stay authoritative", async () => {
  localStorage.clear();
  localStorage.setItem(
    threadExpansionKey(null, "me", "a", "root"),
    JSON.stringify([["branch", true]]),
  );
  const h = setup();
  try {
    await h.render([{ ...base, initialMode: "collapsed" }]);
    assert.equal(h.views[0].expanded.has("branch"), true);
    await act(() => h.views[0].toggle(messages[1]));
    assert.equal(h.views[0].expanded.has("branch"), false);
  } finally {
    await h.close();
  }
  const fresh = setup();
  try {
    await fresh.render([
      {
        ...base,
        channelId: "fresh",
        initialMode: "collapsed",
        isUnread: () => true,
      },
    ]);
    assert.equal(fresh.views[0].expanded.has("branch"), false);
    assert.equal(
      fresh.views[0].expanded.has("root"),
      true,
      "Collapsed initializes nested branches, retaining direct replies",
    );
  } finally {
    await fresh.close();
  }
});
test("manual nested choices synchronize live across surfaces and stay scope-isolated", async () => {
  localStorage.clear();
  const h = setup();
  try {
    await h.render([base, base, { ...base, channelId: "other" }]);
    assert.ok(
      h.views[0].expanded.has("branch") && h.views[1].expanded.has("branch"),
    );
    await act(() => h.views[0].toggle(messages[1]));
    assert.equal(h.views[1].expanded.has("branch"), false);
    assert.equal(h.views[2].expanded.has("branch"), true);
    await act(() => h.views[1].toggle(messages[1]));
    assert.equal(h.views[0].expanded.has("branch"), true);
  } finally {
    await h.close();
  }
});
test("failed storage retains a live scoped session choice across surfaces and remount", async () => {
  localStorage.clear();
  const options = { ...base, channelId: "quota" };
  const h = setup();
  const original = window.Storage.prototype.setItem;
  try {
    await h.render([options, options]);
    window.Storage.prototype.setItem = () => {
      throw new Error("storage denied");
    };
    await act(() => h.views[0].toggle(messages[1]));
    assert.equal(h.views[0].preferenceError, true);
    assert.equal(h.views[1].preferenceError, true);
    assert.equal(h.views[1].expanded.has("branch"), false);
  } finally {
    window.Storage.prototype.setItem = original;
    await h.close();
  }
  const reopened = setup();
  try {
    await reopened.render([options]);
    assert.equal(reopened.views[0].expanded.has("branch"), false);
  } finally {
    await reopened.close();
  }
});

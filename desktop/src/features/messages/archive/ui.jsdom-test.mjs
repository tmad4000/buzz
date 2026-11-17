import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { relayClient } from "@/shared/api/relayClient";
import { ArchiveProvider, useArchive } from "./ArchiveProvider.tsx";
import {
  ArchiveHoverAction,
  ArchiveRowActions,
  ArchiveChannelToggle,
} from "./ArchiveActions.tsx";
import {
  ArchiveEntry,
  ArchiveRunProvider,
  buildArchiveRuns,
} from "./ArchiveRun.tsx";
const h = React.createElement;
const root = {
  id: "r",
  rootId: null,
  body: "root body",
  createdAt: 10,
  author: "Jacob",
  depth: 0,
  time: "",
};
let api, live, replyIds, cmds, qc, reconnects;
function Probe() {
  api = useArchive();
  return h(
    "button",
    { onClick: () => api.toggle("c", root, "thread") },
    "Archive whole thread",
  );
}
function Rows() {
  const archive = useArchive(),
    entries = [
      root,
      { ...root, id: "s", body: "second body" },
      { ...root, id: "z", body: "visible body" },
    ].map((message) => ({ message, summary: null }));
  const runs = buildArchiveRuns(
    entries,
    (e) =>
      !archive.showArchived("c") &&
      archive.isArchived("c", e.message.id, e.message.rootId),
  );
  return h(
    ArchiveRunProvider,
    null,
    entries.map(({ message }) =>
      h(
        ArchiveEntry,
        { key: message.id, id: message.id, run: runs.get(message.id) },
        h(
          "div",
          null,
          message.body,
          h(ArchiveHoverAction, { channelId: "c", message }),
        ),
      ),
    ),
  );
}
function mount(children) {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    h(
      QueryClientProvider,
      { client: qc },
      h(
        ArchiveProvider,
        {
          pubkey: "a".repeat(64),
          relayUrl: "wss://archive.test",
          channels: [{ id: "c", isMember: true }],
        },
        h(Probe),
        children,
      ),
    ),
  );
}
beforeEach(() => {
  window.localStorage.clear();
  live = [];
  reconnects = [];
  replyIds = ["q"];
  cmds = [];
  mock.method(relayClient, "fetchEvents", async () => []);
  mock.method(relayClient, "subscribeLive", async (filter, cb) => {
    if (filter["#h"]) live.push(cb);
    return async () => {};
  });
  mock.method(relayClient, "subscribeToReconnects", (callback) => {
    reconnects.push(callback);
    return () => {};
  });
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd) => {
      cmds.push(cmd);
      if (cmd === "get_thread_replies")
        return {
          events: replyIds.map((id) => ({
            id,
            kind: 9,
            pubkey: "b".repeat(64),
            content: id,
            created_at: 11,
            tags: [
              ["h", "c"],
              ["e", "r", "", "root"],
              ["e", "r", "", "reply"],
            ],
          })),
          nextCursor: null,
        };
      throw Error(`Unexpected ${cmd}`);
    },
  };
});
afterEach(() => {
  cleanup();
  qc?.clear();
  mock.restoreAll();
  delete window.__TAURI_INTERNALS__;
});
test("channel run Show reveals all siblings without unarchiving; channel toggle is independent", async () => {
  mount(
    h(
      React.Fragment,
      null,
      h(ArchiveChannelToggle, { channelId: "c" }),
      h(Rows),
    ),
  );
  await waitFor(() => assert.equal(api.ready, true));
  fireEvent.click(
    screen.getAllByRole("button", { name: "Archive message for me" })[0],
  );
  fireEvent.click(
    screen.getAllByRole("button", { name: "Archive message for me" })[0],
  );
  assert.equal(screen.queryByText("root body"), null);
  assert.equal(screen.queryByText("second body"), null);
  assert.ok(screen.getByText("2 archived ·"));
  fireEvent.click(screen.getByRole("button", { name: "Show", exact: true }));
  assert.ok(screen.getByText("root body"));
  assert.ok(screen.getByText("second body"));
  assert.equal(api.records.size, 2);
  assert.equal(api.showArchived("c"), false);
  fireEvent.click(screen.getByRole("button", { name: "Show archived" }));
  assert.equal(api.showArchived("c"), true);
  assert.equal(api.records.size, 2);
  assert.equal(
    cmds.some((cmd) => /read|seen|delete|send_message/.test(cmd)),
    false,
  );
});
test("focused row E archives but editor input and modified keys keep their ownership; context menu offers thread", async () => {
  mount(
    h(
      ArchiveRowActions,
      { channelId: "c", message: root },
      h("input", { "aria-label": "Draft" }),
    ),
  );
  await waitFor(() => assert.equal(api.ready, true));
  const region = screen.getByRole("group", { name: "Message actions" });
  fireEvent.keyDown(screen.getByLabelText("Draft"), { key: "e" });
  assert.equal(api.records.size, 0);
  fireEvent.keyDown(region, { key: "e", metaKey: true });
  assert.equal(api.records.size, 0);
  fireEvent.keyDown(region, { key: "e" });
  assert.equal(api.records.has("m:r"), true);
  fireEvent.contextMenu(region, { button: 2 });
  assert.ok(screen.getByRole("menuitem", { name: "Archive thread for me" }));
});
test("thread snapshot catches new reply and keeps replay archived without any observation acknowledgement", async () => {
  mount(null);
  await waitFor(() => assert.equal(api.ready, true));
  fireEvent.click(screen.getByRole("button", { name: "Archive whole thread" }));
  await waitFor(() => assert.equal(api.records.has("t:r"), true));
  assert.deepEqual(api.records.get("t:r").replyIds, ["q"]);
  await waitFor(() => assert.ok(live.length));
  const event = (id) => ({
    id,
    kind: 9,
    pubkey: "b".repeat(64),
    content: id,
    created_at: 1,
    tags: [
      ["h", "c"],
      ["e", "r", "", "root"],
      ["e", "r", "", "reply"],
    ],
  });
  await React.act(async () => {
    for (const cb of live) cb(event("q"));
  });
  assert.equal(api.records.has("t:r"), true);
  await React.act(async () => {
    for (const cb of live) cb(event("new"));
  });
  assert.equal(api.records.has("t:r"), false);
  assert.deepEqual([...new Set(cmds)], ["get_thread_replies"]);
});

test("archived replies disappear from unseen candidates while their observation state remains untouched", async () => {
  const { excludeArchivedReplies } = await import("./unseen.ts");
  const items = [
    { ...root, id: "a", rootId: "r" },
    { ...root, id: "b", rootId: "s" },
    { ...root, id: "c", rootId: "s" },
  ];
  const records = new Map([
    ["t:r", {}],
    ["m:b", {}],
  ]);
  assert.deepEqual(
    excludeArchivedReplies(items, records).map((message) => message.id),
    ["c"],
  );
  records.delete("t:r");
  assert.deepEqual(
    excludeArchivedReplies(items, records).map((message) => message.id),
    ["a", "c"],
  );
  assert.equal(items.length, 3, "projection does not mutate canonical data");
});

test("on-open and expansion legacy paths never acknowledge an archived reply; actual-body callback still can", async () => {
  const { useChannelUnreadState } = await import(
    "@/features/channels/ui/useChannelUnreadState.ts"
  );
  mock.method(document, "hasFocus", () => true);
  const descriptor = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const read = [];
  const messages = [
    root,
    { ...root, id: "q", parentId: "r", rootId: "r", createdAt: 11 },
  ];
  let unread;
  function ReadProbe() {
    const [open, setOpen] = React.useState(false);
    unread = useChannelUnreadState({
      activeChannelId: "c",
      timelineMessages: messages,
      currentPubkey: "a".repeat(64),
      openThreadHeadId: open ? "r" : null,
      threadReplyTargetId: null,
      expandedThreadReplyIds: new Set(),
      getChannelReadAt: () => null,
      getMessageReadAt: () => null,
      clearChannelUnreadSource: () => {},
      markChannelUnread: () => {},
      markMessageRead: (...args) => read.push(args),
      isThreadMuted: () => false,
      readStateVersion: 0,
    });
    return h(
      "button",
      { onClick: () => setOpen(true) },
      "Open regression thread",
    );
  }
  try {
    mount(h(ReadProbe));
    await waitFor(() => assert.equal(api.ready, true));
    await React.act(async () => api.toggle("c", messages[1]));
    fireEvent.click(
      screen.getByRole("button", { name: "Open regression thread" }),
    );
    assert.deepEqual(read, []);
    await React.act(async () => unread.markRevealedRepliesRead("r"));
    assert.deepEqual(read, []);
    await React.act(async () =>
      unread.markSidebarRepliesRead([messages[1]], "r"),
    );
    assert.deepEqual(
      read,
      [["q", 11]],
      "observer callback remains the committed-body authority",
    );
  } finally {
    if (descriptor)
      Object.defineProperty(document, "visibilityState", descriptor);
    else delete document.visibilityState;
  }
});

test("nonmember scopes expose no dead archive controls", async () => {
  mount(h(ArchiveHoverAction, { channelId: "not-joined", message: root }));
  await waitFor(() => assert.equal(api.ready, true));
  assert.equal(api.canArchive("not-joined"), false);
  assert.equal(
    screen.queryByRole("button", { name: "Archive message for me" }),
    null,
  );
  assert.equal(api.records.size, 0);
});

test("reconnect catch-up restores an archived thread without a live event or read acknowledgement", async () => {
  mount(null);
  await waitFor(() => assert.equal(api.ready, true));
  fireEvent.click(screen.getByRole("button", { name: "Archive whole thread" }));
  await waitFor(() => assert.equal(api.records.has("t:r"), true));
  replyIds = ["q", "offline-backdated"];
  await React.act(async () => {
    for (const callback of reconnects) callback();
  });
  await waitFor(() => assert.equal(api.records.has("t:r"), false));
  assert.deepEqual([...new Set(cmds)], ["get_thread_replies"]);
});

test("thread archive completing after channel membership revocation cannot commit", async () => {
  let release,
    started = false;
  window.__TAURI_INTERNALS__.invoke = async (cmd) => {
    if (cmd === "get_thread_replies") {
      started = true;
      return new Promise((resolve) => {
        release = () => resolve({ events: [], nextCursor: null });
      });
    }
    throw Error(`Unexpected ${cmd}`);
  };
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const frame = (channels) =>
    h(
      QueryClientProvider,
      { client: qc },
      h(
        ArchiveProvider,
        { pubkey: "a".repeat(64), relayUrl: "wss://archive.test", channels },
        h(Probe),
      ),
    );
  const view = render(frame([{ id: "c", isMember: true }]));
  await waitFor(() => assert.equal(api.ready, true));
  fireEvent.click(screen.getByRole("button", { name: "Archive whole thread" }));
  await waitFor(() => assert.equal(started, true));
  view.rerender(frame([]));
  await React.act(async () => {
    release();
  });
  assert.equal(api.canArchive("c"), false);
  assert.equal(api.records.has("t:r"), false);
});

test("archive observer adapter excludes archived bodies, fences captured callbacks and re-arms after unarchive", async () => {
  const { useArchiveVisibilityGate } = await import(
    "./useArchiveVisibilityGate.ts"
  );
  const items = [{ ...root, id: "q", parentId: "r", rootId: "r" }];
  let gate;
  function GateProbe() {
    gate = useArchiveVisibilityGate(items, "same-view-visit");
    return null;
  }
  mount(h(GateProbe));
  await waitFor(() => assert.equal(api.ready, true));
  assert.deepEqual(
    gate.messages.map((message) => message.id),
    ["q"],
  );
  const captured = gate.filterVisible,
    initialScope = gate.scope;
  await React.act(async () => api.toggle("c", items[0]));
  assert.deepEqual(gate.messages, []);
  assert.deepEqual(
    captured(items),
    [],
    "old queued callback reads current archive authority",
  );
  assert.notEqual(gate.scope, initialScope);
  const archivedScope = gate.scope;
  await React.act(async () => api.toggle("c", items[0]));
  assert.deepEqual(
    gate.messages.map((message) => message.id),
    ["q"],
  );
  assert.notEqual(
    gate.scope,
    archivedScope,
    "scope epoch resets the existing observer's sent-ID set, so a previously excluded body can be observed after unarchive",
  );
  assert.deepEqual(cmds, [], "adapter itself never writes read or seen state");
});

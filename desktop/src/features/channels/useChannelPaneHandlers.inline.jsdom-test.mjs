import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChannelPaneHandlers } from "./useChannelPaneHandlers.ts";

test("inline send uses captured channel/parent without mutating the side panel", async () => {
  const mutations = [];
  const panelWrites = [];
  const set =
    (name) =>
    (...args) =>
      panelWrites.push([name, ...args]);
  const args = {
    deleteMessageMutation: { mutateAsync: async () => {} },
    editMessageMutation: { mutateAsync: async () => {} },
    toggleReactionMutation: { mutateAsync: async () => {} },
    sendMessageMutation: {
      mutateAsync: async (input) => {
        mutations.push(input);
        return { id: "sent" };
      },
    },
    editTargetId: null,
    editTargetIsThreadReply: false,
    expandedThreadReplyIds: new Set(),
    profiles: {},
    getFirstReplyIdForMessage: () => null,
    getReplyDescendantIdsForMessage: () => [],
    markRevealedRepliesRead: () => {},
    recordThreadInteraction: () => {},
    onOptimisticOpenThreadHeadIdChange: set("optimistic"),
    onRequestEmptyEditDelete: set("delete"),
    openThreadHeadId: "side-a",
    threadReplyTargetId: "side-a-child",
    setExpandedThreadReplyIds: set("expanded"),
    setEditTargetId: set("edit"),
    setOpenThreadHeadId: set("open"),
    setThreadReplyTargetId: set("reply"),
    setThreadScrollTargetId: set("scroll"),
  };
  let latest;
  function Harness({ value }) {
    latest = useChannelPaneHandlers(value);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() => root.render(React.createElement(Harness, { value: args })));
    const capturedSend = latest.handleSendInlineThreadReply;
    await act(() =>
      root.render(
        React.createElement(Harness, {
          value: {
            ...args,
            openThreadHeadId: "side-b",
            threadReplyTargetId: "side-b-child",
          },
        }),
      ),
    );
    await act(() =>
      capturedSend(
        "inline body",
        ["mention"],
        [["imeta", "url media"]],
        "channel-a",
        { parentEventId: "inline-parent", threadHeadId: "inline-root" },
        true,
      ),
    );
    assert.deepEqual(mutations, [
      {
        content: "inline body",
        mentionPubkeys: ["mention"],
        mediaTags: [["imeta", "url media"]],
        channelId: "channel-a",
        parentEventId: "inline-parent",
        threadHeadId: "inline-root",
        outbox: undefined,
        forceRest: true,
      },
    ]);
    assert.deepEqual(panelWrites, []);
    await assert.rejects(
      () => capturedSend("missing context", [], undefined, "channel-a"),
      /Inline reply target unavailable/,
    );
    assert.equal(mutations.length, 1);
    assert.deepEqual(panelWrites, []);
    // Main-composer routing must honor the chosen root after side selection changes.
    await act(() =>
      latest.handleSendMessage("routed draft", [], undefined, "channel-a", {
        parentEventId: "chosen-root",
        threadHeadId: "chosen-root",
      }),
    );
    assert.equal(mutations[1].parentEventId, "chosen-root");
    assert.equal(mutations[1].channelId, "channel-a");
    await act(() =>
      latest.handleSendMessage("new root", [], undefined, "channel-a", null),
    );
    assert.equal(mutations[2].parentEventId, undefined);
    assert.deepEqual(panelWrites, []);
    mutations.length = 0;
    let accept;
    const held = new Promise((resolve) => {
      accept = resolve;
    });
    const origin = {
      viewInstanceId: "captured-sidebar",
      threadRootId: "side-a",
    };
    const outbox = {
      attachments: [],
      onQueued: () => {},
      localSendOrigin: origin,
    };
    await act(() =>
      root.render(
        React.createElement(Harness, {
          value: {
            ...args,
            sendMessageMutation: {
              mutateAsync: async (input) => {
                mutations.push(input);
                await held;
                return { id: "accepted-durable" };
              },
            },
          },
        }),
      ),
    );
    let sending;
    await act(async () => {
      sending = latest.handleSendThreadReply(
        "durable nested",
        [],
        undefined,
        "channel-a",
        { parentEventId: "side-a-child", threadHeadId: "side-a" },
        true,
        outbox,
      );
    });
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].outbox, outbox);
    assert.deepEqual(
      panelWrites,
      [],
      "durable admission, not pre-storage handler state, owns the reveal",
    );
    await act(async () => {
      accept();
      await sending;
    });
    assert.deepEqual(
      panelWrites,
      [],
      "late ACK cannot override a later manual fold or selected target",
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

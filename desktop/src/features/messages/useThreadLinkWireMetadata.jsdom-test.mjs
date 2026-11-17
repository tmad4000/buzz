import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChannelPaneHandlers } from "@/features/channels/useChannelPaneHandlers.ts";

test("production handlers retain native provenance/follow metadata and send no presentation reply root", async () => {
  const sends = [],
    followed = [],
    reactions = [];
  const noop = () => {};
  let handlers;
  const options = {
    deleteMessageMutation: { mutateAsync: async () => {} },
    editMessageMutation: { mutateAsync: async () => {} },
    sendMessageMutation: {
      mutateAsync: async (value) => {
        sends.push(value);
        return { id: "sent" };
      },
    },
    toggleReactionMutation: {
      mutateAsync: async (value) => reactions.push(value),
    },
    editTargetId: null,
    editTargetIsThreadReply: false,
    expandedThreadReplyIds: new Set(),
    getFirstReplyIdForMessage: () => null,
    getReplyDescendantIdsForMessage: () => [],
    markRevealedRepliesRead: noop,
    profiles: undefined,
    recordThreadInteraction: (id) => followed.push(id),
    onOptimisticOpenThreadHeadIdChange: noop,
    onRequestEmptyEditDelete: noop,
    openThreadHeadId: "presentation-a",
    threadReplyTargetId: "native-c",
    setExpandedThreadReplyIds: noop,
    setEditTargetId: noop,
    setOpenThreadHeadId: noop,
    setThreadReplyTargetId: noop,
    setThreadScrollTargetId: noop,
  };
  function Harness() {
    handlers = useChannelPaneHandlers(options);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Harness)));
  const moved = {
    id: "native-c",
    rootId: "presentation-a",
    canonicalRootId: null,
    body: "Original C subject",
    tags: [],
  };
  const descendant = {
    id: "native-reply",
    rootId: "presentation-a",
    canonicalRootId: "native-c",
    body: "Native descendant",
    tags: [],
  };
  const presentation = {
    id: "presentation-a",
    body: "Unrelated presentation subject",
  };
  await act(async () => {
    await handlers.handleSendToChannel(moved, presentation, "channel");
    await handlers.handleSendToChannel(descendant, presentation, "channel");
    await handlers.handleToggleReaction(moved, "👍", false);
    await handlers.handleToggleReaction(descendant, "👍", false);
    await handlers.handleSendThreadReply("Reply", [], [], "channel", {
      parentEventId: moved.id,
      threadHeadId: presentation.id,
    });
  });
  assert.equal(sends[0].sentFromThreadRootId, "native-c");
  assert.equal(sends[0].sentFromThreadRootExcerpt, "Original C subject");
  assert.equal(sends[1].sentFromThreadRootId, "native-c");
  assert.equal(
    sends[1].sentFromThreadRootExcerpt,
    null,
    "never attribute A's subject to C's native root",
  );
  assert.deepEqual(followed, ["native-c", "native-c"]);
  assert.equal(reactions[0].eventId, "native-c");
  assert.equal(sends[2].parentEventId, "native-c");
  assert.equal(
    sends[2].rootEventId,
    undefined,
    "native send mutation/Rust resolves raw ancestry",
  );
  await act(async () => root.unmount());
  container.remove();
});

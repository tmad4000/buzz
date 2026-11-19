import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, renderHook } from "@testing-library/react";
import { withDispatchTraces } from "../../messages/lib/dispatchTrace.ts";
import { buildFlatTimelineEntries } from "../../messages/lib/flatTimeline.ts";
import { useRoutedMessageEdit } from "./useRoutedMessageEdit.ts";

test("edit-last keeps the trace out of main candidates while flat and thread edits target the source", () => {
  const channelId = "11111111-1111-4111-8111-111111111111";
  const main = { id: "main", pubkey: "self", kind: 9, createdAt: 1 };
  const reply = {
    id: "reply",
    pubkey: "self",
    kind: 9,
    createdAt: 2,
    parentId: main.id,
    tags: [
      ["h", channelId],
      ["e", main.id, "", "reply"],
      ["origin", channelId, "main"],
    ],
  };
  const edited = [];
  const threadedEntries = withDispatchTraces(
    [{ message: main, summary: null }],
    [main, reply],
    channelId,
  );
  assert.ok(
    threadedEntries.find((entry) => entry.message.id === reply.id)
      ?.dispatchTrace,
  );
  const { result, rerender } = renderHook(
    ({ mainEntries }) =>
      useRoutedMessageEdit({
        activeChannelId: channelId,
        channelIsCovered: false,
        currentPubkey: "self",
        editTarget: null,
        isSinglePanelView: false,
        mainEntries,
        onCloseThread: () => {},
        onEdit: (message) => edited.push(message.id),
        threadHeadMessage: main,
        threadMessages: [reply],
        useFocusThreadDrawer: false,
      }),
    { initialProps: { mainEntries: threadedEntries } },
  );
  try {
    assert.equal(result.current.handleEditLastOwnMainMessage(), true);
    assert.deepEqual(edited, [main.id]);
    assert.equal(result.current.handleEditLastOwnThreadMessage(), true);
    assert.deepEqual(edited, [main.id, reply.id]);
    rerender({ mainEntries: buildFlatTimelineEntries([main, reply]) });
    assert.equal(result.current.handleEditLastOwnMainMessage(), true);
    assert.deepEqual(edited, [main.id, reply.id, reply.id]);
  } finally {
    cleanup();
  }
});

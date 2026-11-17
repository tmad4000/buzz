import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChannelPaneMessages } from "@/features/channels/ui/useChannelPaneMessages";
import { TimelineViewContext } from "@/features/channels/ui/TimelineViewContext";

test("flattened Timeline display retains canonical root-only composer routing", async () => {
  const root = createRoot(document.createElement("div"));
  const messages = [
    { id: "root", author: "Author", createdAt: 1, depth: 0 },
    {
      id: "reply",
      author: "Author",
      createdAt: 2,
      depth: 1,
      parentId: "root",
      rootId: "root",
    },
    {
      id: "nested",
      author: "Author",
      createdAt: 3,
      depth: 2,
      parentId: "reply",
      rootId: "root",
    },
  ];
  let pane;
  function Probe() {
    pane = useChannelPaneMessages({
      activeChannel: { id: "channel", name: "general", channelType: "stream" },
      isHuddleTranscript: false,
      messages,
      threadSummaries: new Map(),
    });
    return null;
  }
  const render = (mode) =>
    act(() =>
      root.render(
        React.createElement(
          TimelineViewContext.Provider,
          { value: { mode, changeMode() {} } },
          React.createElement(Probe),
        ),
      ),
    );
  try {
    await render("timeline");
    assert.deepEqual(
      pane.mainTimelineEntries.map(({ message }) => message.id),
      ["root", "reply", "nested"],
    );
    assert.deepEqual(
      pane.threadRoutingEntries.map(({ message }) => message.id),
      ["root"],
    );
    assert.equal(pane.threadRoutingEntries[0].summary.replyCount, 2);
    await render("threads");
    assert.equal(pane.threadRoutingEntries, pane.mainTimelineEntries);
    assert.equal(messages[2].depth, 2);
  } finally {
    await act(() => root.unmount());
  }
});

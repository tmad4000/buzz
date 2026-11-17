import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ChannelModeScopeProvider,
  useChannelViewMode,
  timelinePreferenceKey,
} from "@/features/channels/ui/TimelineViewContext";

test("duplicate conversation modes stay local and a new visit restores only its own seed", async () => {
  const root = createRoot(document.createElement("div"));
  const values = {},
    changes = [];
  const storageKey = timelinePreferenceKey("legacy", "chat");
  const prior = localStorage.getItem(storageKey);
  localStorage.setItem(storageKey, "timeline");
  function Probe({ id }) {
    values[id] = useChannelViewMode("legacy", "chat");
    return null;
  }
  const render = (visit = "a-0") =>
    act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            ChannelModeScopeProvider,
            {
              key: visit,
              initialMode: "threads",
              onChange: (mode) => changes.push(["a", mode]),
            },
            React.createElement(Probe, { id: "a" }),
          ),
          React.createElement(
            ChannelModeScopeProvider,
            {
              key: "b",
              initialMode: "timeline",
              onChange: (mode) => changes.push(["b", mode]),
            },
            React.createElement(Probe, { id: "b" }),
          ),
        ),
      ),
    );
  try {
    await render();
    assert.equal(values.a.mode, "threads");
    assert.equal(values.b.mode, "timeline");
    await act(() => values.b.changeMode("threads"));
    await act(() => values.a.changeMode("timeline"));
    await render();
    assert.equal(values.a.mode, "timeline");
    assert.equal(values.b.mode, "threads");
    assert.equal(
      localStorage.getItem(storageKey),
      "timeline",
      "scoped choices do not write legacy device storage",
    );
    assert.deepEqual(changes, [
      ["b", "threads"],
      ["a", "timeline"],
    ]);
    await render("a-new-visit");
    assert.equal(values.a.mode, "threads");
    assert.equal(values.b.mode, "threads");
  } finally {
    await act(() => root.unmount());
    if (prior === null) localStorage.removeItem(storageKey);
    else localStorage.setItem(storageKey, prior);
  }
});

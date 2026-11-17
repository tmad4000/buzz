import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { AppShellProvider } from "@/app/AppShellContext";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { useChannelOpenReadState } from "@/features/channels/ui/useChannelOpenReadState";

// Exercises the production mount effect, including inbox override writes.
test("background mount/arrival, compact-hidden views and hidden documents cannot acknowledge", async () => {
  let visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  let windowFocused = true;
  document.hasFocus = () => windowFocused;
  const writes = [];
  const overrides = [{ id: "top", channelId: "general", tags: [] }];
  const shell = {
    feedItemState: { undoUnread: (id) => writes.push(["undo", id]) },
    locallyUnreadFeedItems: overrides,
    markChannelRead: (...args) => writes.push(["read", ...args]),
  };
  function Host({ at }) {
    useChannelOpenReadState("general", true, at);
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (focused, visible, at = "2026-11-16T00:00:00Z") =>
    act(() =>
      root.render(
        React.createElement(
          AppShellProvider,
          { value: shell },
          React.createElement(
            ConversationViewContext.Provider,
            { value: { viewInstanceId: "b", focused, visible } },
            React.createElement(Host, { at }),
          ),
        ),
      ),
    );
  try {
    await render(false, true);
    await render(false, true, "2026-11-16T00:01:00Z");
    await render(true, false);
    assert.deepEqual(writes, []);
    await render(true, true);
    assert.equal(writes.filter(([kind]) => kind === "read").length, 1);
    writes.length = 0;
    visibility = "hidden";
    await act(() => document.dispatchEvent(new Event("visibilitychange")));
    await render(true, true, "2026-11-16T00:02:00Z");
    assert.deepEqual(writes, []);
    visibility = "visible";
    await act(() => document.dispatchEvent(new Event("visibilitychange")));
    assert.equal(writes.filter(([kind]) => kind === "read").length, 1);
    writes.length = 0;
    windowFocused = false;
    await act(() => window.dispatchEvent(new Event("blur")));
    await render(true, true, "2026-11-16T00:03:00Z");
    assert.deepEqual(writes, []);
    windowFocused = true;
    await act(() => window.dispatchEvent(new Event("focus")));
    assert.equal(writes.filter(([kind]) => kind === "read").length, 1);
  } finally {
    await act(() => root.unmount());
    container.remove();
    delete document.visibilityState;
    delete document.hasFocus;
  }
});

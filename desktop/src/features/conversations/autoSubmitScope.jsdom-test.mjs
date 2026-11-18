import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationAutoSubmitProvider } from "./ConversationAutoSubmitScope.tsx";
import {
  ConversationDraftEditorsProvider,
  ConversationDraftEditorsContext,
} from "./ConversationDraftEditors.tsx";

test("scoped command bridge uses the existing owner, retires interrupted commands and cleans up subscriptions", async () => {
  const view = { id: "a", channelId: "chat", panelState: {} };
  const layout = {
    root: { kind: "pane", id: "pane", viewInstanceId: "a" },
    focusedPaneId: "pane",
    views: { a: view },
  };
  const listeners = new Set();
  const session = {
    scopeKey: "scope",
    controller: {
      getSnapshot: () => ({ layout }),
      visitToken: () => 1,
      subscribe: (notify) => {
        listeners.add(notify);
        return () => listeners.delete(notify);
      },
    },
  };
  const scopeRef = { current: null };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const originalFocus = document.hasFocus;
  const visibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  function ExistingOwner() {
    const coordinator = React.useContext(ConversationDraftEditorsContext);
    React.useLayoutEffect(
      () => coordinator.register("root", "owner", () => true),
      [coordinator],
    );
    return null;
  }
  const render = (active) =>
    act(() =>
      root.render(
        React.createElement(
          ConversationDraftEditorsProvider,
          null,
          React.createElement(
            ConversationAutoSubmitProvider,
            { session, active, isAuthorized: () => true, scopeRef },
            React.createElement(ExistingOwner),
          ),
        ),
      ),
    );
  let commands;
  let unmounted = false;
  try {
    await render(true);
    const scope = scopeRef.current;
    commands = scope.commands;
    assert.equal(scope.coordinator.owner("root"), "owner");
    assert.equal(listeners.size, 1);
    let sends = 0;
    // Controlled endpoint tests the production provider, not MessageComposer/transport.
    commands.register({
      target: {
        scopeKey: "scope",
        viewId: "a",
        channelId: "chat",
        visit: 1,
        draftKey: "root",
        ownerId: "owner",
      },
      admit: () => true,
      submit: async () => {
        sends++;
      },
    });
    let resolve;
    const clearing = new Promise((done) => {
      resolve = done;
    });
    const request = (entryKey, clearTrigger = async () => true) =>
      commands.request({
        entryKey,
        viewId: "a",
        channelId: "chat",
        visit: 1,
        draftKey: "root",
        clearTrigger,
      });
    const interrupted = request("blur", () => clearing);
    window.dispatchEvent(new Event("blur")); // hasFocus returns true again before clearing settles.
    resolve(true);
    assert.equal(await interrupted, "ineligible");
    assert.equal(sends, 0);
    await render(false);
    assert.equal(
      scopeRef.current.commands,
      commands,
      "inactive frame retains its command lifetime",
    );
    assert.equal(await request("inactive"), "ineligible");
    await render(true);
    assert.equal(await request("inactive"), "already-issued");
    assert.equal(await request("fresh"), "submitted");
    assert.equal(sends, 1);
    await act(() => root.unmount());
    unmounted = true;
    assert.equal(scopeRef.current, null);
    assert.equal(listeners.size, 0);
    assert.equal(await request("retired"), "disposed");
  } finally {
    if (!unmounted) await act(() => root.unmount());
    container.remove();
    document.hasFocus = originalFocus;
    if (visibility)
      Object.defineProperty(document, "visibilityState", visibility);
    else delete document.visibilityState;
  }
});

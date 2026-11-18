import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationAutoSubmitContext } from "./ConversationAutoSubmitScope.tsx";
import { DraftEditorPresentationContext } from "./ConversationDraftEditors.tsx";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { DraftEditorCoordinator } from "./draftEditorCoordinator.ts";
import { ConversationAutoSubmitCommands } from "./autoSubmitCommands.ts";
import { useConversationAutoSubmitEndpoint } from "./useConversationAutoSubmitEndpoint.ts";

test("production endpoint captures once and retires input, coverage, changed state and teardown", async () => {
  const container = document.createElement("div");
  const mount = document.createElement("div");
  const editor = document.createElement("div");
  container.append(mount, editor);
  document.body.append(container);
  // Controlled DOM geometry and endpoint callbacks; not Tiptap/transport evidence.
  editor.getClientRects = () => [{ width: 100, height: 20 }];
  const focus = document.hasFocus;
  const visibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const coordinator = new DraftEditorCoordinator();
  const unregister = coordinator.register("root", "owner", () => true);
  const commands = new ConversationAutoSubmitCommands({
    scopeKey: "scope",
    ownerForDraft: (key) => coordinator.owner(key),
    isCurrent: () => true,
  });
  const scope = {
    coordinator,
    commands,
    scopeKey: "scope",
    visitForView: () => 1,
  };
  const view = {
    viewInstanceId: "a",
    visible: true,
    focused: true,
    rootRef: { current: container },
  };
  const presentation = { canEdit: () => coordinator.owner("root") === "owner" };
  const sent = [];
  let state = "ready";
  function Endpoint() {
    useConversationAutoSubmitEndpoint({
      channelId: "chat",
      draftKey: "root",
      editorKey: editor,
      getElement: () => editor,
      read: () => (state === null ? null : { value: state }),
      equals: (a, b) => a.value === b.value,
      submit: async (captured) => {
        sent.push(captured.value);
      },
    });
    return null;
  }
  const root = createRoot(mount);
  const render = () =>
    act(() =>
      root.render(
        React.createElement(
          ConversationAutoSubmitContext.Provider,
          { value: scope },
          React.createElement(
            ConversationViewContext.Provider,
            { value: view },
            React.createElement(
              DraftEditorPresentationContext.Provider,
              { value: presentation },
              React.createElement(Endpoint),
            ),
          ),
        ),
      ),
    );
  const request = (entryKey, clearTrigger = async () => true) =>
    commands.request({
      entryKey,
      viewId: "a",
      channelId: "chat",
      visit: 1,
      draftKey: "root",
      clearTrigger,
    });
  let unmounted = false;
  try {
    await render();
    assert.equal(await request("first"), "submitted");
    assert.deepEqual(sent, ["ready"]);
    for (const interruption of ["input", "coverage", "state"]) {
      let resolve;
      const clearing = new Promise((done) => {
        resolve = done;
      });
      const running = request(interruption, () => clearing);
      await act(async () => {
        if (interruption === "input")
          editor.dispatchEvent(new Event("beforeinput"));
        if (interruption === "coverage") {
          container.setAttribute("inert", "");
          container.removeAttribute("inert");
          await Promise.resolve(); // actual mutation delivery, no invented IO callback
        }
      });
      if (interruption === "state") {
        state = "changed";
        await render();
        state = "ready";
        await render();
      }
      resolve(true);
      assert.equal(await running, "ineligible");
      assert.deepEqual(sent, ["ready"]);
    }
    state = null;
    await render();
    assert.equal(await request("unready"), "unavailable");
    state = "ready";
    await render();
    assert.equal(await request("unready"), "already-issued");
    let resolve;
    const running = request(
      "teardown",
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(() => root.unmount());
    unmounted = true;
    resolve(true);
    assert.equal(await running, "ineligible");
    assert.deepEqual(sent, ["ready"]);
  } finally {
    if (!unmounted) await act(() => root.unmount());
    commands.dispose();
    unregister();
    document.hasFocus = focus;
    if (visibility)
      Object.defineProperty(document, "visibilityState", visibility);
    else delete document.visibilityState;
    container.remove();
  }
});

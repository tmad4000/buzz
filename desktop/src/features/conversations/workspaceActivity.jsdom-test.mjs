import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DraftEditorBoundary,
  DraftEditorPresentationContext,
} from "./ConversationDraftEditors.tsx";
import { DraftEditorCoordinator } from "./draftEditorCoordinator.ts";
import { ConversationViewContext } from "./ConversationViewContext.tsx";

test("inactive workspace keeps its owner/editor but fences retained submit authority and takeover", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container),
    coordinator = new DraftEditorCoordinator();
  let presentation;
  function Editor() {
    presentation = React.useContext(DraftEditorPresentationContext);
    return React.createElement("textarea", {
      "data-live-owner": true,
      defaultValue: "Durable draft",
    });
  }
  const render = (interactive, focused = true) =>
    act(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          ...["a", "b"].map((id) =>
            React.createElement(
              ConversationViewContext.Provider,
              {
                key: id,
                value: {
                  viewInstanceId: id,
                  focused: id === "a" && focused,
                  visible: true,
                  interactive,
                },
              },
              React.createElement(
                DraftEditorBoundary,
                { coordinator, draftKey: "canonical", viewInstanceId: id },
                React.createElement(Editor),
              ),
            ),
          ),
        ),
      ),
    );
  try {
    await render(true);
    const owner = coordinator.owner("canonical"),
      editor = container.querySelector("[data-live-owner]");
    const retained = presentation;
    const takeover = container.querySelector("button");
    // Retain the actual production handler; a disabled DOM click would not test its fence.
    const propsKey = Object.keys(takeover).find((key) =>
      key.startsWith("__reactProps$"),
    );
    const retainedTakeover = takeover[propsKey].onClick;
    assert.equal(retained.canEdit(), true);
    await render(true, false);
    assert.equal(
      retained.canEdit(),
      true,
      "ordinary sibling focus does not revoke captured owner context",
    );
    await render(false, false);
    assert.equal(container.querySelector("[data-live-owner]"), editor);
    assert.equal(coordinator.owner("canonical"), owner);
    assert.equal(retained.canEdit(), false);
    assert.equal(takeover.disabled, true);
    await act(() => retainedTakeover());
    assert.equal(
      coordinator.owner("canonical"),
      owner,
      "retained takeover cannot mutate inactive workspace",
    );
    await act(() => retained.publishPreview("Recovered draft"));
    assert.equal(
      coordinator.preview("canonical"),
      "Recovered draft",
      "existing send compensation can still restore the canonical preview",
    );
    await render(true);
    assert.equal(retained.canEdit(), true);
    assert.equal(container.querySelector("[data-live-owner]"), editor);
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

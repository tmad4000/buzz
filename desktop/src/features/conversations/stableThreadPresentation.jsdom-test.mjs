import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { DraftEditorCoordinator } from "./draftEditorCoordinator.ts";
import {
  DraftEditorBoundary,
  DraftEditorPresentationContext,
} from "./ConversationDraftEditors.tsx";
import { ThreadPanelSurface } from "@/features/channels/ui/ThreadPanelSurface";
import { RightAuxiliaryPane } from "@/features/channels/ui/RightAuxiliaryPane";
import { AuxiliaryPanel } from "@/shared/layout/AuxiliaryPanel";

const noop = () => {};
test("scoped responsive/focus layouts retain composer node, local state, owner and lock when a duplicate appears", async () => {
  const oldMedia = window.matchMedia;
  const oldFrame = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  globalThis.cancelAnimationFrame = clearTimeout;
  const coordinator = new DraftEditorCoordinator();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const mounted = [];
  const unmounted = [];
  const api = {};
  function Editor({ id }) {
    const presentation = React.useContext(DraftEditorPresentationContext);
    api[id] = presentation;
    React.useLayoutEffect(() => {
      mounted.push(id);
      return () => unmounted.push(id);
    }, [id]);
    return React.createElement("textarea", {
      "data-editor": id,
      defaultValue: "initial",
    });
  }
  function Host({ id, mode }) {
    const rootRef = React.useRef(null);
    const docked = mode === "docked";
    const focus = mode === "focus";
    return React.createElement(
      "section",
      {
        ref: rootRef,
        "data-host": id,
        "data-focused-conversation": id === "a" || undefined,
      },
      React.createElement(
        ConversationViewContext.Provider,
        {
          value: {
            viewInstanceId: id,
            focused: id === "a",
            visible: true,
            rootRef,
            contentWidthPx: docked ? 900 : 700,
          },
        },
        React.createElement(
          ThreadPanelSurface,
          {
            channelName: "General",
            covered: false,
            hasActiveEdit: false,
            isFocusDrawer: focus,
            onClose: noop,
          },
          React.createElement(
            RightAuxiliaryPane,
            {
              canResetWidth: false,
              onResetWidth: noop,
              onResizeStart: noop,
              widthPx: 380,
              fillAvailable: !docked,
            },
            React.createElement(
              AuxiliaryPanel,
              {
                widthPx: 380,
                onClose: noop,
                layout: docked ? "split" : "standalone",
                isSinglePanelView: !docked,
              },
              React.createElement(
                DraftEditorBoundary,
                {
                  coordinator,
                  viewInstanceId: id,
                  draftKey: "canonical-shared-root",
                },
                React.createElement(Editor, { id }),
              ),
            ),
          ),
        ),
      ),
    );
  }
  const render = (mode, duplicate) =>
    act(() =>
      root.render(
        ["a", ...(duplicate ? ["b"] : [])].map((id) =>
          React.createElement(Host, { key: id, id, mode }),
        ),
      ),
    );
  try {
    await render("docked", false);
    const original = container.querySelector("[data-editor=a]");
    original.value = "local unsent edit";
    await act(() => api.a.setLocked(true));
    await render("narrow", true);
    assert.equal(container.querySelector("[data-editor=a]"), original);
    assert.equal(original.value, "local unsent edit");
    assert.equal(container.querySelector("[data-editor=b]"), null);
    assert.equal(
      container.querySelector("[data-host=b] [data-draft-preview] button")
        .disabled,
      true,
    );
    await render("focus", true);
    await render("docked", true);
    assert.equal(container.querySelector("[data-editor=a]"), original);
    assert.equal(original.value, "local unsent edit");
    assert.deepEqual(mounted, ["a"]);
    assert.deepEqual(unmounted, []);
    await act(() => api.a.setLocked(false));
    assert.equal(
      container.querySelector("[data-host=b] [data-draft-preview] button")
        .disabled,
      false,
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
    window.matchMedia = oldMedia;
    globalThis.requestAnimationFrame = oldFrame;
    globalThis.cancelAnimationFrame = oldCancel;
  }
});

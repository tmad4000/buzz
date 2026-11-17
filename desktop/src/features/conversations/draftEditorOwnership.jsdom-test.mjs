import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DraftEditorBoundary,
  DraftEditorPresentationContext,
} from "./ConversationDraftEditors.tsx";
import { DraftEditorCoordinator } from "./draftEditorCoordinator.ts";
import { useDraftPersistLifecycle } from "@/features/messages/ui/useDraftPersistSnapshot";
import {
  initDraftStore,
  loadDraftEntry,
  persistDraftEntry,
  clearAllDrafts,
} from "@/features/messages/lib/useDrafts";

// Deliberately mount the actual persistence lifecycle inside the ownership
// boundary: a reducer-only assertion cannot prove flush-before-restore ordering.
test("one editor per canonical draft, live preview and takeover flush precede restore", async () => {
  initDraftStore("synthetic-owner", "wss://split-test.invalid");
  persistDraftEntry("shared", "saved", "channel", [], [], []);
  const coordinator = new DraftEditorCoordinator();
  const editors = {};
  const presentations = {};
  const lifecycle = [];
  function Editor({ id, draftKey }) {
    const content = React.useRef("");
    const spoileredAttachmentUrlsRef = React.useRef(new Set());
    const presentation = React.useContext(DraftEditorPresentationContext);
    const { trackAuthoredContent } = useDraftPersistLifecycle({
      effectiveDraftKey: draftKey,
      channelId: "channel",
      loadDraft: loadDraftEntry,
      persistDraft: (...args) => {
        lifecycle.push(`flush:${id}:${args[1]}`);
        persistDraftEntry(...args);
      },
      getMentionRefs: () => [],
      restoreMentionRefs: () => {},
      livePendingImeta: [],
      setPendingImeta: () => {},
      setContent: (text) => {
        lifecycle.push(`restore:${id}:${text}`);
        content.current = text;
      },
      clearContent: () => {
        content.current = "";
      },
      setSpoileredAttachmentUrls: () => {},
      spoileredAttachmentUrlsRef,
      syncComposerContentFromEditor: () => content.current,
    });
    React.useLayoutEffect(() => {
      presentations[id] = presentation;
      editors[id] = {
        text: () => content.current,
        type: (text) => {
          content.current = text;
          trackAuthoredContent(text);
          presentation.publishPreview(text);
        },
        lock: (locked) => presentation.setLocked(locked),
      };
    });
    return React.createElement("div", { "data-editor": id }, id);
  }
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  const render = (includeB = true) =>
    act(async () =>
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          ["a", ...(includeB ? ["b"] : []), "c"].map((id) => {
            const draftKey = id === "c" ? "other-target" : "shared";
            return React.createElement(
              "section",
              { key: id, "data-pane": id },
              React.createElement(
                DraftEditorBoundary,
                { coordinator, draftKey, viewInstanceId: id },
                React.createElement(Editor, { id, draftKey }),
              ),
            );
          }),
        ),
      ),
    );
  const takeover = (id) =>
    rootElement.querySelector(`[data-pane=${id}] button`);
  try {
    await render();
    assert.deepEqual(
      [...rootElement.querySelectorAll("[data-editor]")].map(
        (el) => el.dataset.editor,
      ),
      ["a", "c"],
    );
    await act(async () => {
      editors.a.type("unsaved from a");
      editors.c.type("different target");
    });
    assert.ok(
      rootElement
        .querySelector("[data-pane=b]")
        .textContent.includes("unsaved from a"),
    );
    const staleOwner = presentations.a;
    lifecycle.length = 0;
    await act(async () => takeover("b").click());
    assert.equal(editors.b.text(), "unsaved from a");
    assert.equal(loadDraftEntry("shared").content, "unsaved from a");
    assert.ok(
      lifecycle.indexOf("flush:a:unsaved from a") <
        lifecycle.indexOf("restore:b:unsaved from a"),
    );
    assert.equal(staleOwner.canEdit(), false);
    assert.equal(presentations.b.canEdit(), true);
    assert.equal(editors.c.text(), "different target");
    await act(async () => editors.b.lock(true));
    assert.equal(takeover("a").disabled, true);
    await act(async () => takeover("a").click());
    assert.equal(presentations.b.canEdit(), true);
    await act(async () => {
      editors.b.lock(false);
      editors.b.type("latest from b");
    });
    await render(false);
    assert.equal(editors.a.text(), "latest from b");
    assert.equal(editors.c.text(), "different target");
    assert.equal(presentations.a.canEdit(), true);
  } finally {
    await act(() => root.unmount());
    rootElement.remove();
    clearAllDrafts();
  }
});

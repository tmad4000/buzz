import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  DraftEditorBoundary,
  DraftEditorPresentationContext,
} from "@/features/conversations/ConversationDraftEditors";
import { DraftEditorCoordinator } from "@/features/conversations/draftEditorCoordinator";
import { resolveNestedRoutingTarget } from "../lib/threadRouting.ts";
import { resolveSentDraftKey } from "./draftSubmitKey.ts";

// Extract the actual callback, not a hand-written replica. Production host tests
// separately bind its picker, editor, persistence and publisher integration.
function loadSubmit(scope) {
  const path = new URL("./MessageComposer.tsx", import.meta.url);
  const source = ts.createSourceFile(
    "MessageComposer.tsx",
    fs.readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let callback;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "submitMessage"
    )
      callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, "must bind production submitMessage callback");
  const code = ts.transpileModule(
    `globalThis.submit = ${callback.getText(source)};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(code, scope);
  return scope.submit;
}

test("chosen-thread submit synchronously locks real ownership and stale callbacks do no work after takeover", async () => {
  const coordinator = new DraftEditorCoordinator();
  const presentations = {};
  function Editor({ id }) {
    const value = React.useContext(DraftEditorPresentationContext);
    React.useLayoutEffect(() => {
      presentations[id] = value;
    });
    return React.createElement("span", null, id);
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        ["a", "b"].map((id) =>
          React.createElement(
            "section",
            { key: id, "data-pane": id },
            React.createElement(
              DraftEditorBoundary,
              {
                coordinator,
                draftKey: "canonical-channel",
                viewInstanceId: id,
              },
              React.createElement(Editor, { id }),
            ),
          ),
        ),
      ),
    );
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const preparations = [],
    locks = [],
    reads = [];
  try {
    await act(async () => render());
    const old = presentations.a;
    assert.equal(old.canEdit(), true);
    const scope = {
      durableOutbox: false,
      threadRoutingScope: undefined,
      threadRoutingEntries: undefined,
      resolveNestedRoutingTarget,
      presentationRef: {
        current: {
          ...old,
          setLocked: (value) => {
            locks.push(value);
            old.setLocked(value);
          },
        },
      },
      syncComposerContentFromEditor: () => {
        reads.push("read");
        return "release follow-up";
      },
      isEditSubmissionLocked: true,
      editTargetRef: { current: null },
      onEditSaveRef: { current: null },
      media: {
        pendingImetaRef: { current: [] },
        queuedAttachmentsRef: { current: [] },
      },
      disabledRef: { current: false },
      voiceNote: { statusRef: { current: "idle" } },
      isSendingRef: { current: false },
      isSubmitLockedRef: { current: false },
      isUploadingRef: { current: false },
      mentionSendFlow: {
        isPreparingMentionSend: false,
        sendMessageWithMentionFlow: async (draft) => {
          preparations.push(draft);
          await held;
        },
      },
      onCaptureRoutedSend: () => undefined,
      onCaptureSendContext: () => {
        throw new Error("explicit choice must override live selection");
      },
      setIsSubmitLocked: () => {},
      onPreparingMentionSendChange: () => {},
      getReadyLinkPreviewTags: () => [],
      prepareBackgroundLinkPreviews: () => null,
      getLiveLinkPreviewCandidates: () => [],
      persistentAudience: { pubkeys: [] },
      channelId: "original-channel",
      resolveSentDraftKey,
      effectiveDraftKeyRef: { current: "canonical-channel" },
      drafts: { loadDraft: () => ({ content: "saved" }) },
      effectiveDraftKey: "canonical-channel",
      spoileredAttachmentUrls: new Set(),
    };
    const submit = loadSubmit(scope);
    let sending;
    await act(async () => {
      sending = submit("chosen-root");
    });
    assert.equal(
      locks[0],
      true,
      "lock must be set synchronously before async preparation",
    );
    const takeover = container.querySelector('[data-pane="b"] button');
    assert.equal(takeover.disabled, true);
    assert.equal(coordinator.canTakeOver("canonical-channel"), false);
    assert.equal(preparations.length, 1);
    assert.equal(
      preparations[0].capturedThreadContext.parentEventId,
      "chosen-root",
    );
    assert.equal(preparations[0].capturedChannelId, "original-channel");
    // A later route/selection mutation must not rewrite the prepared data.
    scope.channelId = "later-channel";
    await act(async () => {
      release();
      await sending;
    });
    assert.deepEqual(locks, [true, false]);
    assert.equal(preparations[0].capturedChannelId, "original-channel");
    await act(async () => takeover.click());
    assert.equal(old.canEdit(), false);
    assert.equal(presentations.b.canEdit(), true);
    const readsBefore = reads.length;
    scope.editTargetRef.current = { id: "edit-target" };
    scope.onEditSaveRef.current = () => {
      throw new Error("stale edit must not save");
    };
    await submit("stale-root");
    await submit(null);
    await submit();
    assert.equal(
      reads.length,
      readsBefore,
      "ownership check must precede editor reads and edit/selected-thread paths",
    );
    assert.equal(
      preparations.length,
      1,
      "stale picker callback cannot prepare or publish",
    );
    assert.deepEqual(locks, [true, false]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

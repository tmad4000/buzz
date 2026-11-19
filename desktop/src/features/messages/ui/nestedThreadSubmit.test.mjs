import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import { resolveNestedRoutingTarget } from "../lib/threadRouting.ts";
import { resolveSentDraftKey } from "./draftSubmitKey.ts";
function load(scope) {
  const ast = ts.createSourceFile(
    "MessageComposer.tsx",
    fs.readFileSync(new URL("./MessageComposer.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let arrow;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(ast) === "submitMessage"
    )
      arrow = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(arrow);
  vm.runInNewContext(
    ts.transpileModule(`globalThis.submit=${arrow.getText(ast)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    scope,
  );
  return scope.submit;
}
function setup() {
  const captured = [],
    locks = [];
  let reads = 0,
    owner = true,
    release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const entry = (id, parentId, extra = {}) => ({
    message: { id, parentId, kind: 9, ...extra },
    summary: null,
  });
  const origin = { rootId: "head", visitId: "visit", surface: "sidebar" };
  const scope = {
    durableOutbox: true,
    presentationRef: {
      current: { canEdit: () => owner, setLocked: (x) => locks.push(x) },
    },
    syncComposerContentFromEditor: () => {
      reads++;
      return "@Nora release note";
    },
    editTargetRef: { current: null },
    onEditSaveRef: { current: null },
    media: {
      pendingImetaRef: {
        current: [{ url: "https://fixture.invalid/file.pdf" }],
      },
      queuedAttachmentsRef: { current: [{ id: "queued" }] },
    },
    disabledRef: { current: false },
    voiceNote: { statusRef: { current: "idle" } },
    isSendingRef: { current: false },
    isSubmitLockedRef: { current: false },
    isUploadingRef: { current: false },
    mentionSendFlow: {
      isPreparingMentionSend: false,
      sendMessageWithMentionFlow: async (data) => {
        captured.push(data);
        await held;
      },
    },
    onCaptureSendContext: () => ({
      parentEventId: "prior-target",
      threadHeadId: "canonical",
      localSendOrigin: origin,
    }),
    threadRoutingScope: { headId: "head", rootEventId: "canonical" },
    threadRoutingEntries: [
      entry("head", "canonical"),
      entry("child", "head"),
      entry("deep", "child"),
      entry("other", "canonical"),
      entry("pending", "head", { pending: true }),
    ],
    resolveNestedRoutingTarget,
    onCaptureRoutedSend: () => {
      throw Error("must not use main root observer in nested scope");
    },
    setIsSubmitLocked: () => {},
    onPreparingMentionSendChange: () => {},
    getReadyLinkPreviewTags: () => [],
    prepareBackgroundLinkPreviews: () => null,
    getLiveLinkPreviewCandidates: () => [],
    persistentAudience: { pubkeys: ["pinned-agent"] },
    channelId: "original-channel",
    resolveSentDraftKey,
    effectiveDraftKeyRef: { current: "thread:head" },
    effectiveDraftKey: "thread:head",
    drafts: { loadDraft: () => ({ content: "saved" }) },
    spoileredAttachmentUrls: new Set(),
  };
  return {
    scope,
    submit: load(scope),
    captured,
    locks,
    origin,
    release,
    reads: () => reads,
    setOwner: (value) => {
      owner = value;
    },
  };
}
test("actual nested submit captures selected parent/canonical root/source origin and keeps media/draft/audience through awaits", async () => {
  const h = setup();
  const pending = h.submit("deep");
  assert.equal(h.locks[0], true);
  assert.equal(h.captured.length, 1);
  const data = h.captured[0];
  assert.equal(data.capturedThreadContext.parentEventId, "deep");
  assert.equal(data.capturedThreadContext.threadHeadId, "canonical");
  assert.equal(data.capturedThreadContext.localSendOrigin, h.origin);
  assert.equal(data.capturedChannelId, "original-channel");
  assert.equal(data.recoveryDraftKey, "thread:head");
  assert.equal(data.sentDraftKey, "thread:head");
  assert.deepEqual(data.addressedAgentPubkeys, ["pinned-agent"]);
  assert.equal(data.pendingImeta.length, 1);
  assert.equal(data.queuedAttachments.length, 1);
  h.scope.channelId = "other-channel";
  h.scope.effectiveDraftKeyRef.current = "thread:other";
  h.scope.threadRoutingScope = { headId: "other", rootEventId: "other" };
  h.release();
  await pending;
  assert.equal(data.capturedThreadContext.parentEventId, "deep");
  assert.equal(data.capturedChannelId, "original-channel");
  assert.deepEqual(h.locks, [true, false]);
});
test("Reply to thread root overrides prior reply target; regular Send retains it", async () => {
  for (const [choice, expected] of [
    [null, "head"],
    [undefined, "prior-target"],
  ]) {
    const h = setup();
    h.release();
    await h.submit(choice);
    assert.equal(h.captured[0].capturedThreadContext.parentEventId, expected);
    assert.equal(h.captured[0].capturedThreadContext.threadHeadId, "canonical");
    assert.equal(h.captured[0].capturedThreadContext.localSendOrigin, h.origin);
  }
});
test("unowned, stale-draft and non-descendant callbacks do not prepare or publish", async () => {
  for (const choice of ["other", "unknown", "pending"]) {
    const h = setup();
    await h.submit(choice);
    assert.equal(h.captured.length, 0);
    assert.deepEqual(h.locks, []);
  }
  const h = setup();
  h.setOwner(false);
  await h.submit("deep");
  assert.equal(h.reads(), 0);
  assert.equal(h.captured.length, 0);
  const stale = setup();
  stale.scope.effectiveDraftKeyRef.current = "thread:new";
  await stale.submit("deep");
  assert.equal(stale.captured.length, 0);
});

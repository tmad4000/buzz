import assert from "node:assert/strict";
import { test } from "node:test";
import {
  setup,
  deferred,
  KEY,
  TEXT,
} from "./useMentionSendFlow.test-support.mjs";

test("bound agent and files enter durable queue offline without preflight RPCs", async () => {
  const s = await setup({ lifecycle: true });
  s.dismiss();
  s.options.durableOutbox = true;
  s.options.outboxScope = {
    relayUrl: "https://captured.example",
    signerPubkey: "owner",
  };
  s.options.mentions.memberPubkeys = new Set([KEY]);
  s.options.mentions.revalidateMentionPubkeys = async () => {
    throw new Error("offline preflight must be deferred");
  };
  const origin = {
    viewInstanceId: "origin-view:capture",
    threadRootId: "display-root",
  };
  const delivered = deferred();
  let queued;
  s.options.onSendRef.current = async (...args) => {
    queued = args[6];
    queued.onQueued();
    await delivered.promise;
  };
  s.rerender();
  await s.act(async () => {
    await s.result.current.sendMessageWithMentionFlow({
      capturedChannelId: "general",
      capturedThreadContext: {
        parentEventId: "nested-parent",
        threadHeadId: "canonical-root",
        localSendOrigin: origin,
      },
      trimmed: TEXT,
      pendingImeta: [],
      queuedAttachments: [],
      recoveryDraftKey: "thread:a",
      sentDraftKey: "thread:a",
    });
  });
  assert.ok(queued);
  assert.deepEqual(queued.scope, s.options.outboxScope);
  assert.deepEqual(
    queued.localSendOrigin,
    origin,
    "captured display-view origin must survive mention awaits into durable submission",
  );
  assert.ok(queued.agentPubkeys.includes(KEY));
  assert.equal(s.options.contentRef.current, "");
  assert.equal(s.events("error").length, 0);
  await s.act(async () => delivered.resolve());
  s.unmount();
});

test("failed durable commit leaves the authored text in its composer", async () => {
  const s = await setup({ lifecycle: true });
  s.dismiss();
  s.options.durableOutbox = true;
  s.options.mentions.memberPubkeys = new Set([KEY]);
  s.options.onSendRef.current = async () => {
    throw new Error("disk full before queue commit");
  };
  s.rerender();
  await s.act(async () => {
    await s.result.current.sendMessageWithMentionFlow({
      capturedChannelId: "general",
      trimmed: TEXT,
      pendingImeta: [],
      queuedAttachments: [],
      recoveryDraftKey: "thread:a",
      sentDraftKey: "thread:a",
    });
  });
  assert.equal(s.options.contentRef.current, TEXT);
  assert.equal(s.events("error").length, 1);
  s.unmount();
});

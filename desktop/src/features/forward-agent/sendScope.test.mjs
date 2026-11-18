import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { messageMentionPubkeys } from "@/features/messages/lib/messageMentionPubkeys.ts";
const source = fs.readFileSync(
  new URL("../messages/hooks.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
function mutation() {
  let options;
  const calls = [];
  const invalidated = [];
  const sideEffects = [];
  const mocks = {
    react: { useContext: () => ({}) },
    "@tanstack/react-query": {
      useQueryClient: () => ({
        getQueryData: () => [],
        getQueriesData: () => [],
        invalidateQueries: (filter) => {
          invalidated.push(filter);
          return Promise.resolve();
        },
        cancelQueries: () => {
          sideEffects.push("cancel");
          return Promise.resolve();
        },
        setQueryData: () => sideEffects.push("cache-write"),
      }),
      useMutation: (o) => {
        options = o;
        return {};
      },
    },
    "@/features/messages/lib/imetaMediaMarkdown": {
      splitOutgoingTags: () => ({
        mediaTags: [],
        emojiTags: [],
        mentionTags: [],
        linkPreviewTags: [],
      }),
    },
    "@/features/messages/lib/messageMentionPubkeys": { messageMentionPubkeys },
    "@/features/messages/lib/messageQueryKeys": {
      channelMessagesKey: (id) => ["channel-messages", id],
      channelWindowKey: (id) => ["channel-window", id],
    },
    "@/features/moderation/lib/timeoutStore": {
      recordTimeoutFromRejection: () => sideEffects.push("record-timeout"),
      clearTimeoutState: () => sideEffects.push("clear-timeout"),
    },
    "@/features/messages/lib/threading": { normalizeMentionPubkeys: (p) => p },
    "@/shared/constants/kinds": { KIND_STREAM_MESSAGE: 9 },
    "@/shared/api/tauri": {
      sendChannelMessage: async (...args) => {
        calls.push(args);
        return { eventId: "b".repeat(64), createdAt: 100 };
      },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) => mocks[s] ?? {},
    Set,
    Map,
    Date,
  });
  // biome-ignore lint/correctness/useHookAtTopLevel: Pure production-hook evaluation with injected React IO.
  module.exports.useSendMessageMutation(null, { pubkey: "self" });
  return {
    run: options.mutationFn,
    callbacks: options,
    calls,
    invalidated,
    sideEffects,
  };
}
const target = {
  id: "target",
  channelType: "dm",
  participantPubkeys: ["self", "agent"],
  memberPubkeys: ["self", "agent"],
};
test("actual shared mutation forces native fenced path and preserves explicit target and DM recipients", async () => {
  const m = mutation();
  const result = await m.run({
    targetChannel: target,
    channelId: "target",
    content: "quote",
    expectedScope: { relayUrl: "https://original.test", signerPubkey: "self" },
  });
  assert.equal(m.calls.length, 1);
  assert.equal(m.calls[0][0], "target");
  assert.equal(m.calls[0][2], null);
  assert.deepEqual(m.calls[0][4], ["agent"]);
  assert.equal(m.calls[0][10], "https://original.test");
  assert.equal(m.calls[0][11], "self");
  assert.equal(result.id, "b".repeat(64));
});
test("captured signer mismatch fails before any native signing or publication", async () => {
  const m = mutation();
  await assert.rejects(
    m.run({
      targetChannel: target,
      content: "quote",
      expectedScope: {
        relayUrl: "https://original.test",
        signerPubkey: "different",
      },
    }),
    /Captured signer/,
  );
  assert.equal(m.calls.length, 0);
});

test("scoped mutation callbacks skip optimistic and global side effects; ACK only invalidates captured target client", async () => {
  const m = mutation();
  const variables = {
    targetChannel: target,
    channelId: "target",
    content: "quote",
    expectedScope: { relayUrl: "https://old.test", signerPubkey: "self" },
  };
  assert.equal(await m.callbacks.onMutate(variables), undefined);
  m.callbacks.onError(Error("timeout"), variables, undefined);
  m.callbacks.onSuccess({ id: "ack" }, variables, undefined);
  assert.deepEqual(m.sideEffects, []);
  assert.equal(m.invalidated.length, 2);
  assert.equal(
    JSON.stringify(m.invalidated[0]),
    JSON.stringify({
      queryKey: ["channel-messages", "target"],
      refetchType: "none",
    }),
  );
});

test("ordinary composer callbacks retain their existing timeout behavior", () => {
  const m = mutation();
  m.callbacks.onError(Error("timeout"), {}, undefined);
  m.callbacks.onSuccess({ id: "ack" }, {}, undefined);
  assert.deepEqual(m.sideEffects, ["record-timeout", "clear-timeout"]);
  assert.equal(m.invalidated.length, 0);
});

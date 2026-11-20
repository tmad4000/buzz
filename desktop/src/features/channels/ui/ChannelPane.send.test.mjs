import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Execute the production host callback without mounting unrelated channel chrome.
function host(onSendMessage, overrides = {}) {
  const source = ts.createSourceFile(
    "useChannelMessageSend.ts",
    readFileSync(
      new URL("./useChannelMessageSend.ts", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let callback;
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "handleSendMessage"
    )
      callback = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(callback, "production main host send callback exists");
  const environment = {
    onSendMessage,
    captureScrollSend: () => undefined,
    isActiveWelcomeChannel: false,
    containsWelcomePersonaMention: () => false,
    mentionsKnownAgent: () => false,
    knownAgentPubkeys: new Set(),
    messageTimelineRef: { current: { scrollToBottomOnNextUpdate() {} } },
    activeChannelId: "channel",
    channelPaneMountedRef: { current: true },
    activeChannelIdRef: { current: "channel" },
    goChannel: async () => {},
    completeWelcomeComposerBanner() {},
    ...overrides,
  };
  const javascript = ts.transpile(`const callback = (${callback});`, {
    target: ts.ScriptTarget.ES2022,
  });
  return Function(
    ...Object.keys(environment),
    `${javascript}
return callback;`,
  )(...Object.values(environment));
}

test("main host preserves durable submission through queue commit and accepted routed ID", async () => {
  let editor = "Captured routed draft";
  let release;
  const accepted = new Promise((resolve) => {
    release = resolve;
  });
  const context = { parentEventId: "destination", threadHeadId: "destination" };
  const submission = {
    attachments: [{ id: "raw-file" }],
    onQueued() {
      editor = "";
    },
  };
  const send = host(async (...args) => {
    assert.equal(args[4], context);
    assert.equal(args[5], true);
    assert.equal(
      args[6],
      submission,
      "the original submission, callbacks and attachments reach storage",
    );
    args[6].onQueued();
    return accepted;
  });
  const result = send(editor, [], [], "channel", context, true, submission);
  assert.equal(
    editor,
    "",
    "durable admission clears the captured composer before ACK",
  );
  release({ id: "accepted" });
  assert.deepEqual(await result, { id: "accepted" });
});

test("main host never clears on failed storage and preserves the publisher rejection", async () => {
  let editor = "Keep failed routed draft";
  const submission = {
    attachments: [],
    onQueued() {
      editor = "";
    },
  };
  const failure = new Error("storage unavailable");
  const send = host(async (...args) => {
    assert.equal(args[6], submission);
    throw failure;
  });
  await assert.rejects(
    send(
      editor,
      [],
      undefined,
      "channel",
      { parentEventId: "thread", threadHeadId: "thread" },
      false,
      submission,
    ),
    (error) => error === failure,
  );
  assert.equal(editor, "Keep failed routed draft");
});

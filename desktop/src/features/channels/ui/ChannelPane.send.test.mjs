import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Exercise the actual adapter without mounting the entire channel pane.
const source = readFileSync(
  new URL("./ChannelPane.tsx", import.meta.url),
  "utf8",
);
const callback = source.slice(
  source.indexOf("  const handleSendMessage ="),
  source.indexOf("  const canDropInMainColumn ="),
);
const compiled = ts.transpileModule(`${callback}\nreturn handleSendMessage;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
for (const parentEventId of [null, "captured-thread"]) {
  test(`main composer forwards durable admission for ${parentEventId ?? "channel"} sends`, async () => {
    let queued = 0;
    let forwarded;
    const submission = { attachments: [], onQueued: () => queued++ };
    const send = new Function(
      "React",
      "isActiveWelcomeChannel",
      "messageTimelineRef",
      "onSendMessage",
      "activeChannelId",
      "channelPaneMountedRef",
      "activeChannelIdRef",
      "completeWelcomeComposerBanner",
      "goChannel",
      "knownAgentPubkeys",
      compiled,
    )(
      { useCallback: (fn) => fn },
      false,
      { current: null },
      async (...args) => {
        forwarded = args;
        args[6]?.onQueued();
        return { id: "accepted" };
      },
      "channel",
      { current: true },
      { current: "channel" },
      () => {},
      () => {},
      new Set(),
    );
    const context = { parentEventId, threadHeadId: parentEventId };
    const result = await send(
      "retained text",
      [],
      [],
      "channel",
      context,
      true,
      submission,
    );
    assert.equal(forwarded[6], submission);
    assert.equal(forwarded[4], context);
    assert.equal(forwarded[5], true);
    assert.equal(queued, 1, "durable commit can clear the captured draft");
    assert.equal(result.id, "accepted");
  });
}

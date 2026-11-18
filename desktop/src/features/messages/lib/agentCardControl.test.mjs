import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
registerHooks({
  resolve(s, c, n) {
    if (s === "@/shared/api/tauri")
      return { shortCircuit: true, url: "control-test:native" };
    return n(s, c);
  },
  load(u, c, n) {
    if (u === "control-test:native")
      return {
        shortCircuit: true,
        format: "module",
        source:
          'export const invokeTauri=async(command,args)=>{globalThis.__controlCalls.push({command,args});return {event_id:"f".repeat(64),signed_event:{},parent_event_id:args.parentEventId,root_event_id:args.rootEventId,depth:2,created_at:1};};',
      };
    return n(u, c);
  },
});
const {
  agentCardControlTarget,
  sendAgentControlTrigger,
  JACOB_CONTROL_SIGNER,
} = await import("./agentCardControl.ts");
const { parseBridgeStatusCard } = await import("./bridgeStatusCard.ts");
const agent = "9e03d4e0-1234-4567-8901-234567890abc",
  server = "srv_KIFHQ_zsBnI2";
const base = {
  id: "a".repeat(64),
  kind: 9,
  parentId: "b".repeat(64),
  rootId: "c".repeat(64),
  signerPubkey:
    "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb",
  tags: [
    ["h", "channel"],
    ["e", "c".repeat(64), "", "root"],
    ["e", "b".repeat(64), "", "reply"],
  ],
};
const body = (label = "⏳ Working", source = "root", id = agent) =>
  `${label} — Worker · model unavailable (codex)\nAgent \`${id}\` · server \`${server}\`\n[Open agent](paseo://h/${server}/agent/${id})\nReported status · source: ${source}`;
const message = { ...base, body: body() };
test("only signer-scoped attributed Jacob cards expose exact control intent; Root is hidden", () => {
  assert.equal(
    agentCardControlTarget(message, "channel", JACOB_CONTROL_SIGNER).command,
    "stop",
  );
  for (const patch of [
    { signerPubkey: "other" },
    { editSignerPubkey: "other" },
    { pending: true },
    { id: "not-an-event" },
    { tags: [["h", "other"]] },
    {
      body: body("⏳ Working", "root", "d3caa262-cdcd-454d-9d42-0cd05ac69156"),
    },
    { body: body("✅ Done") },
  ])
    assert.equal(
      agentCardControlTarget(
        { ...message, ...patch },
        "channel",
        JACOB_CONTROL_SIGNER,
      ),
      null,
    );
  assert.equal(agentCardControlTarget(message, "channel", "other"), null);
  assert.equal(
    agentCardControlTarget(message, undefined, JACOB_CONTROL_SIGNER),
    null,
  );
});
test("bridge-owned control state is read back verbatim and Continue requires resumable Stopped", () => {
  const stopped = {
    ...message,
    body: body("🛑 Stopped by Jacob at 03:18 UTC", "jacob"),
  };
  assert.equal(
    parseBridgeStatusCard(stopped).label,
    "🛑 Stopped by Jacob at 03:18 UTC",
  );
  assert.equal(
    agentCardControlTarget(stopped, "channel", JACOB_CONTROL_SIGNER).command,
    "continue",
  );
  assert.equal(
    agentCardControlTarget(
      {
        ...stopped,
        body:
          stopped.body +
          "\nContinuation unavailable: the interrupted instruction was not verified.",
      },
      "channel",
      JACOB_CONTROL_SIGNER,
    ),
    null,
  );
  for (const label of [
    "Already idle when Jacob asked to stop at 03:18 UTC",
    "Interruption acknowledged; new activity exists at 03:18 UTC",
    "Continuation queued by Jacob at 03:18 UTC",
  ])
    assert.equal(
      parseBridgeStatusCard({ ...message, body: body(label, "jacob") }).label,
      label,
    );
  assert.equal(
    parseBridgeStatusCard({
      ...message,
      body: body("🛑 Stopped by Jacob at 03:18 UTC", "root"),
    }),
    null,
  );
});
test("existing private project card attribution works without inventing a reply parent", () => {
  const project = {
    ...message,
    parentId: null,
    rootId: null,
    tags: [["h", "channel"]],
    body: "⏳ Working\nItem: synthetic-work\n\nProject detail\n\n" + body(),
  };
  assert.equal(
    agentCardControlTarget(project, "channel", JACOB_CONTROL_SIGNER).rootId,
    project.id,
  );
  const stopped = {
    ...project,
    body:
      "Item: synthetic-work\n\nProject detail\n\n" +
      body("🛑 Stopped by Jacob at 03:18 UTC", "jacob"),
  };
  assert.equal(
    agentCardControlTarget(stopped, "channel", JACOB_CONTROL_SIGNER).command,
    "continue",
  );
});
test("production native sender emits only exact direct-card stop/continue replies with tenant+signer fence", async () => {
  globalThis.__controlCalls = [];
  for (const [label, source, command] of [
    ["⏳ Working", "root", "stop"],
    ["🛑 Stopped by Jacob at 03:18 UTC", "jacob", "continue"],
  ]) {
    const target = agentCardControlTarget(
      { ...message, body: body(label, source) },
      "channel",
      JACOB_CONTROL_SIGNER,
    );
    await sendAgentControlTrigger(target, "https://relay.example");
    const call = globalThis.__controlCalls.at(-1);
    assert.equal(call.command, "send_channel_message");
    assert.equal(call.args.content, command);
    assert.equal(call.args.parentEventId, message.id);
    assert.equal(call.args.rootEventId, "c".repeat(64));
    assert.equal(call.args.expectedSignerPubkey, JACOB_CONTROL_SIGNER);
    assert.equal(call.args.expectedRelayUrl, "https://relay.example");
    assert.equal(call.args.kind, 9);
    assert.equal(call.args.mediaTags, null);
    assert.equal(call.args.mentionPubkeys, null);
  }
  assert.equal(globalThis.__controlCalls.length, 2);
  delete globalThis.__controlCalls;
});

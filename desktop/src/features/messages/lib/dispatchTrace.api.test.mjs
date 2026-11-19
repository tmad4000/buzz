import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";
const calls = [];
globalThis.__dispatchTraceInvoke = async (command, payload) => {
  calls.push({ command, payload });
  return {
    event_id: "ack",
    parent_event_id: "parent",
    root_event_id: "root",
    depth: 1,
    created_at: 123,
    signed_event: { id: "signed" },
  };
};
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/shared/api/tauri")
      return {
        url: "data:text/javascript,export const invokeTauri = (...args) => globalThis.__dispatchTraceInvoke(...args);",
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { sendChannelMessage } = await import(
  "../../../shared/api/tauriMessages.ts"
);
test("actual IPC adapter forwards dedicated provenance alongside captured signer/relay and prepareOnly without publishing", async () => {
  const origin = ["origin", "11111111-1111-4111-8111-111111111111", "main"];
  const result = await sendChannelMessage(
    origin[1],
    "draft",
    "parent",
    [],
    [],
    undefined,
    [],
    [],
    [],
    undefined,
    "https://captured.test",
    "self",
    "root",
    true,
    "client",
    123,
    origin,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "send_channel_message");
  assert.equal(calls[0].payload.prepareOnly, true);
  assert.deepEqual(calls[0].payload.dispatchOriginTag, origin);
  assert.equal(calls[0].payload.expectedRelayUrl, "https://captured.test");
  assert.equal(calls[0].payload.expectedSignerPubkey, "self");
  assert.equal(calls[0].payload.channelId, origin[1]);
  assert.equal(calls[0].payload.parentEventId, "parent");
  assert.equal(calls[0].payload.rootEventId, "root");
  assert.equal(result.signedEvent.id, "signed");
});
test("legacy IPC calls send no provenance and retain normal preparation defaults", async () => {
  await sendChannelMessage("channel", "normal");
  assert.equal(calls[1].payload.dispatchOriginTag, null);
  assert.equal(calls[1].payload.prepareOnly, false);
  assert.equal(calls[1].payload.expectedRelayUrl, null);
});
test.after(() => {
  hook.deregister();
  delete globalThis.__dispatchTraceInvoke;
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

let handler;
globalThis.window = {
  __TAURI_INTERNALS__: { invoke: (...args) => handler(...args) },
};
const { fetchSetupBrokerPublicKey, requestSetupBroker } = await import(
  "./tauriSetupBroker.ts"
);
afterEach(() => {
  handler = null;
});

test("setup broker wrapper exposes fixed native commands and discards all error bodies", async () => {
  const calls = [];
  handler = async (...args) => {
    calls.push(args);
    return {
      status: 429,
      retryAfterSeconds: 60,
      body: { error: "must not be exposed" },
    };
  };
  assert.deepEqual(await fetchSetupBrokerPublicKey(), {
    status: 429,
    retryAfterSeconds: 60,
    body: null,
  });
  const body = { attemptId: "synthetic", signature: "synthetic-proof" };
  assert.deepEqual(await requestSetupBroker("authorization", body), {
    status: 429,
    retryAfterSeconds: 60,
    body: null,
  });
  assert.deepEqual(
    calls.map(([command, args]) => ({ command, args })),
    [
      { command: "setup_broker_public_key", args: {} },
      {
        command: "setup_broker_request",
        args: { operation: "authorization", body },
      },
    ],
  );
});
test("invalid replies and native exceptions never expose native text or private arguments", async () => {
  for (const value of [
    null,
    { status: "200", body: {} },
    { status: 999, body: {} },
    { status: 200, body: [] },
    { status: 200, body: null },
  ]) {
    handler = async () => value;
    await assert.rejects(
      fetchSetupBrokerPublicKey(),
      (error) => error.message === "Setup broker unavailable",
    );
  }
  handler = async () => {
    throw Error("private native exception");
  };
  await assert.rejects(
    requestSetupBroker("exchange", {
      attemptId: "synthetic",
      signature: "fixture",
      authorizationCode: "fixture",
      pkceVerifier: "fixture",
    }),
    (error) => error.message === "Setup broker unavailable",
  );
  handler = async () => ({
    status: 200,
    retryAfterSeconds: 999999,
    body: { status: "pending" },
  });
  assert.deepEqual(await fetchSetupBrokerPublicKey(), {
    status: 200,
    retryAfterSeconds: null,
    body: { status: "pending" },
  });
});

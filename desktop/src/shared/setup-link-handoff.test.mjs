import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

let enabled = true;
let queue = [];
let id = 1;
const callbacks = new Map(),
  events = new Map(),
  acknowledgements = [];
const internals = {
  transformCallback(callback) {
    const key = id++;
    callbacks.set(key, callback);
    return key;
  },
  async invoke(command, args) {
    if (command === "ideaflow_setup_links_enabled") return enabled;
    if (command === "take_pending_setup_link") return queue[0] ?? null;
    if (command === "acknowledge_pending_setup_link") {
      if (queue[0]?.id !== args.id) return false;
      acknowledgements.push(args.id);
      queue.shift();
      return true;
    }
    if (command === "plugin:event|listen") {
      const key = id++;
      events.set(key, args.handler);
      return key;
    }
    if (command === "plugin:event|unlisten") {
      events.delete(args.eventId);
      return;
    }
    throw Error("unhandled test IPC");
  },
};
globalThis.window = {
  __TAURI_INTERNALS__: internals,
  __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener() {} },
};
globalThis.__TAURI_INTERNALS__ = internals;
const { listenForSetupLinkHandoffs } = await import("./setup-link-handoff.ts");
const stops = [];
async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
function emit() {
  for (const [key, callback] of events)
    callbacks.get(callback)?.({
      event: "ideaflow-setup-link-available",
      id: key,
      payload: null,
    });
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function mount(accept, options = {}) {
  let retry;
  const stop = await listenForSetupLinkHandoffs({
    accept,
    onAvailable: (callback) => {
      retry = callback;
      return () => {};
    },
    onUnavailable:
      options.onUnavailable ??
      (() => assert.fail("unexpected handoff failure")),
  });
  stops.push(stop);
  return { stop, retry: () => retry?.() };
}
afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  await settle();
  queue = [];
  events.clear();
  callbacks.clear();
  acknowledgements.length = 0;
  enabled = true;
});

test("default-off handoff never reads a reference or calls the acceptor", async () => {
  enabled = false;
  queue = [{ id: "first", code: "synthetic" }];
  await mount(async () => assert.fail("disabled acceptor"));
  await settle();
  assert.equal(events.size, 0);
  assert.equal(queue.length, 1);
  assert.deepEqual(acknowledgements, []);
});

test("cold and warm references are acknowledged only after durable acceptance", async () => {
  queue = [{ id: "first", code: "synthetic-one" }];
  const accepted = [];
  await mount(async (pending) => {
    accepted.push(pending.id);
    return true;
  });
  await settle();
  queue.push({ id: "second", code: "synthetic-two" });
  emit();
  await settle();
  assert.deepEqual(accepted, ["first", "second"]);
  assert.deepEqual(acknowledgements, accepted);
  assert.equal(queue.length, 0);
});

test("declined handoff stays queued until an explicit availability retry", async () => {
  queue = [{ id: "first", code: "synthetic" }];
  let ready = false,
    calls = 0;
  const handler = await mount(async () => {
    calls++;
    return ready;
  });
  await settle();
  assert.equal(calls, 1);
  assert.equal(queue.length, 1);
  ready = true;
  handler.retry();
  await settle();
  assert.deepEqual(acknowledgements, ["first"]);
});

test("stopped acceptor is aborted and cannot acknowledge through a remount", async () => {
  queue = [{ id: "first", code: "synthetic" }];
  const pending = deferred();
  let oldSignal,
    newCalls = 0;
  const first = await mount(async (_link, signal) => {
    oldSignal = signal;
    return pending.promise;
  });
  await settle();
  first.stop();
  assert.equal(oldSignal.aborted, true);
  await mount(async () => {
    newCalls++;
    return true;
  });
  await settle();
  assert.equal(newCalls, 0);
  pending.resolve(true);
  await settle();
  assert.equal(newCalls, 1);
  assert.deepEqual(acknowledgements, ["first"]);
});

test("acceptance failure is sanitized, leaves reference queued, and permits retry", async () => {
  queue = [{ id: "first", code: "synthetic" }];
  let errors = 0,
    fail = true;
  const handler = await mount(
    async () => {
      if (fail) throw Error("private fixture detail must not escape");
      return true;
    },
    {
      onUnavailable: (...args) => {
        assert.deepEqual(args, []);
        errors++;
      },
    },
  );
  await settle();
  assert.equal(errors, 1);
  assert.equal(queue.length, 1);
  fail = false;
  handler.retry();
  await settle();
  assert.deepEqual(acknowledgements, ["first"]);
});

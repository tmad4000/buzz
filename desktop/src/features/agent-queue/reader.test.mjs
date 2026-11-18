import assert from "node:assert/strict";
import test from "node:test";
import { createQueueReader } from "./reader.ts";
import { snapshot, event, clock, flush } from "./fixtures.mjs";
function harness(decrypt = async () => snapshot()) {
  const sessions = [];
  let calls = 0,
    closed = 0;
  const auth = [];
  const reader = createQueueReader({
    now: () => clock,
    authenticate: (e) => {
      auth.push(e.id);
      return e.sig !== "foreign";
    },
    decrypt: async (e) => {
      calls++;
      return decrypt(e);
    },
    subscribe: async (accept, ready, signal) => {
      sessions.push({ accept, ready, signal });
      return async () => {
        closed++;
      };
    },
  });
  return {
    reader,
    sessions,
    auth,
    get calls() {
      return calls;
    },
    get closed() {
      return closed;
    },
  };
}
test("one shared subscription, empty/error honesty, and RAM cleared when last consumer retires", async () => {
  const h = harness();
  const off = h.reader.subscribe(() => {}),
    off2 = h.reader.subscribe(() => {});
  assert.equal(h.sessions.length, 1);
  h.sessions[0].ready("eose");
  assert.equal(h.reader.getSnapshot().status, "error");
  h.sessions[0].accept(event());
  await flush();
  assert.equal(h.reader.getSnapshot().snapshot.depth, 1);
  off();
  assert.equal(h.sessions[0].signal.aborted, false);
  off2();
  await flush();
  assert.equal(h.sessions[0].signal.aborted, true);
  assert.equal(h.closed, 1);
  assert.equal(h.reader.getSnapshot().snapshot, undefined);
});
test("bounded latest-only decrypt coalescing, newer wins, authenticated malformed newest hides old", async () => {
  const releases = [];
  const seen = [];
  const h = harness(
    (e) =>
      new Promise((resolve) => {
        seen.push(e.id);
        releases.push(resolve);
      }),
  );
  const off = h.reader.subscribe(() => {});
  const s = h.sessions[0];
  s.accept(event());
  for (let i = 1; i <= 20; i++)
    s.accept(event(i.toString(16).padStart(64, "0"), clock + i));
  assert.equal(h.calls, 1);
  releases.shift()(snapshot());
  await flush();
  assert.equal(h.calls, 2);
  assert.equal(seen[1], (20).toString(16).padStart(64, "0"));
  releases.shift()(snapshot());
  await flush();
  assert.equal(h.reader.getSnapshot().status, "ready");
  s.accept({
    ...event("f".repeat(64), clock + 21),
    tags: [...event().tags, ["h", "bad"]],
  });
  await flush();
  assert.equal(h.reader.getSnapshot().status, "error");
  assert.equal(h.reader.getSnapshot().snapshot, undefined);
  s.accept(event("e".repeat(64), clock + 20));
  await flush();
  assert.equal(h.calls, 2);
  s.accept({ ...event("e".repeat(64), clock + 22), sig: "foreign" });
  await flush();
  assert.equal(h.reader.getSnapshot().status, "error");
  off();
});
test("scope A→retire→A and delayed unsubscribe cannot revive an old decrypt/event", async () => {
  const releases = [];
  const h = harness(() => new Promise((resolve) => releases.push(resolve)));
  const old = h.reader.subscribe(() => {});
  h.sessions[0].accept(event());
  old();
  const current = h.reader.subscribe(() => {});
  h.sessions[0].accept(event("a".repeat(64), clock + 30));
  h.sessions[1].accept(event("b".repeat(64), clock + 1));
  releases.shift()(snapshot());
  await flush();
  assert.equal(h.calls, 2);
  assert.equal(h.reader.getSnapshot().snapshot, undefined);
  releases.shift()({
    ...snapshot(),
    depth: 0,
    items: [],
    oldestCreatedAt: null,
  });
  await flush();
  assert.equal(h.reader.getSnapshot().snapshot.depth, 0);
  h.sessions[0].ready("closed");
  assert.equal(h.reader.getSnapshot().status, "ready");
  current();
});
test("invalid plaintext and decrypt failure hide projection; no count or inferred delivery survives", async () => {
  let value = snapshot();
  const h = harness(async () => {
    if (value instanceof Error) throw value;
    return value;
  });
  const off = h.reader.subscribe(() => {});
  h.sessions[0].accept(event());
  await flush();
  value = { ...snapshot(), availability: "unavailable" };
  h.sessions[0].accept(event("2".repeat(64), clock + 1));
  await flush();
  assert.equal(h.reader.getSnapshot().snapshot, undefined);
  assert.equal(h.reader.getSnapshot().status, "error");
  value = new Error("must not log this private ciphertext/body");
  h.sessions[0].accept(event("3".repeat(64), clock + 2));
  await flush();
  assert.deepEqual(h.reader.getSnapshot(), { status: "error" });
  off();
});

test("stalled IPC becomes error without spawning replacements or reviving a timed-out projection", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const releases = [];
  const h = harness(() => new Promise((resolve) => releases.push(resolve)));
  const off = h.reader.subscribe(() => {});
  h.sessions[0].accept(event());
  t.mock.timers.tick(5000);
  assert.equal(h.reader.getSnapshot().status, "error");
  assert.equal(h.calls, 1);
  releases.shift()(snapshot());
  await flush();
  assert.equal(h.reader.getSnapshot().status, "error");
  h.sessions[0].accept(event("2".repeat(64), clock + 1));
  assert.equal(h.calls, 2);
  for (let i = 3; i < 8; i++)
    h.sessions[0].accept(event(String(i).repeat(64), clock + i));
  t.mock.timers.tick(5000);
  assert.equal(h.calls, 2);
  assert.equal(h.reader.getSnapshot().status, "error");
  releases.shift()(snapshot());
  await flush();
  assert.equal(h.calls, 2);
  assert.equal(h.reader.getSnapshot().status, "error");
  off();
  t.mock.timers.reset();
});

test("authenticated future-clock violation clears prior projection; unsigned future noise does not", async () => {
  const h = harness();
  const off = h.reader.subscribe(() => {});
  h.sessions[0].accept(event());
  await flush();
  h.sessions[0].accept({
    ...event("2".repeat(64), clock + 100),
    sig: "foreign",
  });
  await flush();
  assert.equal(h.reader.getSnapshot().status, "ready");
  h.sessions[0].accept(event("3".repeat(64), clock + 100));
  await flush();
  assert.equal(h.reader.getSnapshot().status, "error");
  assert.equal(h.reader.getSnapshot().snapshot, undefined);
  off();
});

test("readiness/transport failure retains authenticated bad-event watermark and cannot restore older idle", async () => {
  const h = harness();
  const off = h.reader.subscribe(() => {});
  const s = h.sessions[0];
  s.accept(event());
  await flush();
  s.accept({
    ...event("2".repeat(64), clock + 2),
    tags: [...event().tags, ["h", "bad"]],
  });
  await flush();
  s.ready("timeout");
  s.accept(event("3".repeat(64), clock + 1));
  await flush();
  assert.equal(h.reader.getSnapshot().status, "error");
  assert.equal(h.reader.getSnapshot().snapshot, undefined);
  assert.equal(h.calls, 1);
  off();
});

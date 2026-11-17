import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyPlan } from "./thread_link_apply.mjs";
import { hash, ThreadLinkError } from "./thread_link_common.mjs";
import { journalStore } from "./thread_link_journal.mjs";
import { buildPlan } from "./thread_link_plan.mjs";
import { snapshot } from "./thread_link_snapshot.mjs";
import { FINGERPRINT, message, world } from "./thread_link_test.fixture.mjs";

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thread-journal-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
const planBytes = (plan) => Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);

test("whole batch intent and per-operation submitting marker precede every POST", async (t) => {
  const setup = world();
  const second = message(setup.channel, 14);
  setup.events.set(second.id, second);
  const current = await snapshot(setup.client, setup.channel);
  const plan = buildPlan(
    setup.client,
    current,
    [setup.child, second].map((child) => ({
      operation: "link",
      childEventId: child.id,
      parentEventId: setup.root.id,
    })),
    FINGERPRINT,
  );
  const bytes = planBytes(plan),
    digest = hash(bytes);
  const store = journalStore(path.join(temporary(t), "state"));
  setup.hooks.beforePost = (event) => {
    const journal = store.read(digest);
    assert.equal(journal.entries.length, 2);
    assert.deepEqual(
      journal.entries.map((entry) => entry.eventBytes),
      plan.operations.map((operation) => operation.eventBytes),
    );
    const entry = journal.entries.find((item) => item.eventId === event.id);
    assert.equal(entry.state, "submitting");
    assert.equal(entry.attempts, 1);
  };
  const result = await applyPlan({
    client: setup.client,
    store,
    bytes,
    expectedDigest: digest,
    fingerprint: () => FINGERPRINT,
  });
  assert.equal(
    result.operations.every((operation) => operation.state === "verified"),
    true,
  );
  assert.equal(setup.submissions.length, 2);
});

test("failed durable preparation cannot reach submit; later retry keeps prepared wire IDs", async (t) => {
  const setup = world();
  const current = await snapshot(setup.client, setup.channel);
  const plan = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  const bytes = planBytes(plan),
    digest = hash(bytes);
  const actual = journalStore(path.join(temporary(t), "state"));
  let first = true;
  const fault = {
    ...actual,
    lock: (id, callback) =>
      actual.lock(id, (locked) =>
        callback({
          ...locked,
          save: (journal) => {
            locked.save(journal);
            if (first) {
              first = false;
              throw new Error("synthetic fsync acknowledgement loss");
            }
          },
        }),
      ),
  };
  await assert.rejects(
    applyPlan({
      client: setup.client,
      store: fault,
      bytes,
      expectedDigest: digest,
      fingerprint: () => FINGERPRINT,
    }),
  );
  assert.equal(setup.submissions.length, 0);
  assert.equal(actual.read(digest).entries[0].state, "prepared");
  const originalId = actual.read(digest).entries[0].eventId;
  const result = await applyPlan({
    client: setup.client,
    store: actual,
    bytes,
    expectedDigest: digest,
    fingerprint: () => FINGERPRINT,
  });
  assert.equal(result.operations[0].eventId, originalId);
  assert.equal(setup.submissions.length, 1);
});

test("global writer lock excludes another plan and never replaces a foreign owner", async (t) => {
  const root = path.join(temporary(t), "state");
  const store = journalStore(root);
  await store.lock("a".repeat(64), async () => {
    await assert.rejects(
      store.lock("b".repeat(64), async () => {}),
      (error) => error.code === "journal-locked",
    );
  });
  const foreign = {
    token: "synthetic-other-owner",
    pid: 123,
    processIdentity: "123:123",
  };
  await assert.rejects(
    store.lock("a".repeat(64), async () => {
      fs.writeFileSync(
        path.join(root, "lock/owner.json"),
        JSON.stringify(foreign),
        { mode: 0o600 },
      );
    }),
    (error) => error.code === "journal-lock-changed",
  );
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, "lock/owner.json"))),
    foreign,
  );
});

test("unsafe and orphaned journal paths fail closed without changing their permissions", async (t) => {
  const directory = temporary(t),
    root = path.join(directory, "public");
  fs.mkdirSync(root, { mode: 0o755 });
  fs.chmodSync(root, 0o755);
  await assert.rejects(
    journalStore(root).lock("a".repeat(64), async () => {}),
    ThreadLinkError,
  );
  assert.equal(fs.statSync(root).mode & 0o777, 0o755);
  const privateRoot = path.join(directory, "private");
  fs.mkdirSync(privateRoot, { mode: 0o700 });
  const alias = path.join(directory, "alias");
  fs.symlinkSync(privateRoot, alias);
  await assert.rejects(
    journalStore(alias).lock("a".repeat(64), async () => {}),
    ThreadLinkError,
  );
  const orphan = path.join(privateRoot, "a".repeat(64));
  fs.mkdirSync(orphan, { mode: 0o700 });
  fs.writeFileSync(path.join(orphan, "orphan.tmp"), "synthetic", {
    mode: 0o600,
  });
  assert.throws(
    () => journalStore(privateRoot).read("a".repeat(64)),
    (error) => error.code === "orphaned-journal-files",
  );
});

test("expired unsubmitted plans need operational refresh, never an adopted wire timestamp", async (t) => {
  const setup = world();
  const current = await snapshot(setup.client, setup.channel);
  const plan = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  const bytes = planBytes(plan),
    digest = hash(bytes);
  const store = journalStore(path.join(temporary(t), "state"));
  setup.advance(901);
  await assert.rejects(
    applyPlan({
      client: setup.client,
      store,
      bytes,
      expectedDigest: digest,
      fingerprint: () => FINGERPRINT,
    }),
    (error) => error.code === "signed-event-expired",
  );
  assert.equal(store.read(digest), null);
  assert.equal(setup.submissions.length, 0);
  const refreshed = buildPlan(
    setup.client,
    await snapshot(setup.client, setup.channel),
    [
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  assert.notEqual(refreshed.operations[0].eventId, plan.operations[0].eventId);
  assert.equal(
    refreshed.operations[0].childEventId,
    plan.operations[0].childEventId,
  );
  assert.equal(
    refreshed.operations[0].parentEventId,
    plan.operations[0].parentEventId,
  );
  const refreshedBytes = planBytes(refreshed);
  const result = await applyPlan({
    client: setup.client,
    store,
    bytes: refreshedBytes,
    expectedDigest: hash(refreshedBytes),
    fingerprint: () => FINGERPRINT,
  });
  assert.equal(result.operations[0].state, "verified");
});

test("an uncertain journal cannot adopt newly signed bytes even when its old ID is retained", async (t) => {
  const setup = world();
  const current = await snapshot(setup.client, setup.channel);
  const plan = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  const bytes = planBytes(plan),
    digest = hash(bytes);
  const store = journalStore(path.join(temporary(t), "state"));
  const input = {
    client: setup.client,
    store,
    bytes,
    expectedDigest: digest,
    fingerprint: () => FINGERPRINT,
  };
  setup.hooks.beforePost = () => {
    throw new Error("synthetic unreceived timeout");
  };
  await applyPlan(input);
  setup.hooks.beforePost = null;
  setup.advance();
  const file = path.join(store.root, digest, "journal.json");
  const journal = JSON.parse(fs.readFileSync(file));
  journal.entries[0].eventBytes = setup.client.signAnnotation(
    setup.channel,
    plan.operations[0],
    setup.client.now(),
  );
  assert.notEqual(
    JSON.parse(journal.entries[0].eventBytes).id,
    journal.entries[0].eventId,
  );
  fs.writeFileSync(file, JSON.stringify(journal), { mode: 0o600 });
  await assert.rejects(
    applyPlan(input),
    (error) => error.code === "invalid-journal",
  );
  assert.equal(setup.submissions.length, 1);
});

// Observe the actual filesystem boundary used by journalStore, not an injected store.
test("fresh journal ancestors are durably linked before callback and POST", async (t) => {
  const setup = world();
  const current = await snapshot(setup.client, setup.channel);
  const plan = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  const bytes = planBytes(plan),
    digest = hash(bytes);
  const base = temporary(t),
    root = path.join(base, "new-local", "new-state", "thread-links");
  const events = [];
  const mkdir = fs.mkdirSync,
    fsync = fs.fsyncSync;
  t.mock.method(fs, "mkdirSync", (name, options) => {
    const result = mkdir(name, options);
    events.push({ kind: "mkdir", name: path.resolve(name) });
    return result;
  });
  t.mock.method(fs, "fsyncSync", (fd) => {
    const name = fs.readlinkSync(`/proc/self/fd/${fd}`);
    fsync(fd);
    if (fs.fstatSync(fd).isDirectory()) events.push({ kind: "sync", name });
  });
  const expected = [
    path.join(base, "new-local"),
    path.join(base, "new-local", "new-state"),
    root,
    path.join(root, digest),
  ];
  const check = () => {
    for (const name of expected) {
      const created = events.findIndex(
        (event) => event.kind === "mkdir" && event.name === name,
      );
      assert.ok(created >= 0, `missing mkdir for ${name}`);
      const nextMkdir = events.findIndex(
        (event, index) => index > created && event.kind === "mkdir",
      );
      const synced = events.findIndex(
        (event, index) =>
          index > created &&
          event.kind === "sync" &&
          event.name === path.dirname(name),
      );
      assert.ok(
        synced > created && (nextMkdir < 0 || synced < nextMkdir),
        `parent was not fsynced immediately after mkdir for ${name}`,
      );
    }
  };
  const actual = journalStore(root);
  const store = {
    ...actual,
    lock: (id, callback) =>
      actual.lock(id, (locked) => {
        check();
        return callback(locked);
      }),
  };
  setup.hooks.beforePost = check;
  const result = await applyPlan({
    client: setup.client,
    store,
    bytes,
    expectedDigest: digest,
    fingerprint: () => FINGERPRINT,
  });
  assert.equal(result.operations[0].state, "verified");
  assert.equal(setup.submissions.length, 1);
});

test("directory parent fsync failure prevents callback and POST; retry persists the existing anchor", async (t) => {
  const setup = world();
  const current = await snapshot(setup.client, setup.channel);
  const plan = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  const bytes = planBytes(plan),
    digest = hash(bytes);
  const base = temporary(t),
    root = path.join(base, "new-local", "new-state", "thread-links");
  const fsync = fs.fsyncSync;
  let inject = true,
    callbacks = 0,
    recoveredAnchor = false;
  t.mock.method(fs, "fsyncSync", (fd) => {
    const directory = fs.readlinkSync(`/proc/self/fd/${fd}`);
    if (directory === path.dirname(root) && fs.existsSync(root)) {
      if (inject) {
        const error = new Error("synthetic parent fsync failure");
        error.code = "EIO";
        throw error;
      }
      recoveredAnchor = true;
    }
    return fsync(fd);
  });
  const actual = journalStore(root);
  const store = {
    ...actual,
    lock: (id, callback) =>
      actual.lock(id, (locked) => {
        callbacks++;
        assert.equal(recoveredAnchor, true);
        return callback(locked);
      }),
  };
  const invoke = () =>
    applyPlan({
      client: setup.client,
      store,
      bytes,
      expectedDigest: digest,
      fingerprint: () => FINGERPRINT,
    });
  await assert.rejects(invoke(), (error) => error.code === "EIO");
  assert.equal(callbacks, 0);
  assert.equal(setup.submissions.length, 0);
  assert.equal(fs.existsSync(root), true);
  inject = false;
  const result = await invoke();
  assert.equal(callbacks, 1);
  assert.equal(result.operations[0].state, "verified");
  assert.equal(setup.submissions.length, 1);
});

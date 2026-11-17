import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { parseArgs } from "./thread_link_cli.mjs";
import {
  CONTENT,
  DM,
  ThreadLinkError,
  finalizeEvent,
  getPublicKey,
  hash,
} from "./thread_link_common.mjs";
import {
  createClient,
  privateBytes,
  validateRegistration,
} from "./thread_link_transport.mjs";
import { snapshot, channelHistory } from "./thread_link_snapshot.mjs";
import {
  ALICE,
  BOB,
  TEST_CHANNEL,
  message,
  world,
} from "./thread_link_test.fixture.mjs";

test("help and option parsing expose no identity, endpoint or arbitrary-event writer override", () => {
  assert.equal(parseArgs(["--help"]).command, "help");
  for (const flag of [
    "--relay",
    "--key",
    "--private-key",
    "--auth-tag",
    "--content",
    "--event-file",
    "--state-dir",
  ]) {
    assert.throws(
      () =>
        parseArgs([
          "link",
          "a".repeat(64),
          "--parent",
          "b".repeat(64),
          "--dry-run",
          flag,
          "synthetic-value",
        ]),
      ThreadLinkError,
    );
  }
  assert.throws(
    () => parseArgs(["link", "a".repeat(64), "--parent", "b".repeat(64)]),
    ThreadLinkError,
  );
  assert.throws(() => parseArgs(["apply", "plan.json"]), ThreadLinkError);
  assert.throws(
    () =>
      parseArgs([
        "verify",
        "plan.json",
        "--expected-digest",
        "a".repeat(64),
        "--channel",
        TEST_CHANNEL,
      ]),
    ThreadLinkError,
  );
  assert.throws(
    () => parseArgs(["plan", "--operations", "one", "--operations", "two"]),
    ThreadLinkError,
  );
  const result = spawnSync(
    "bash",
    ["scripts/ideaflow/thread-links", "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).commands.length, 5);
  assert.equal(result.stderr.includes("private-key"), false);
});

test("fresh scope requires exact private file policy and exact registration metadata", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thread-private-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "data");
  fs.writeFileSync(file, "synthetic", { mode: 0o600 });
  assert.equal(privateBytes(file, 128).toString(), "synthetic");
  assert.throws(() => privateBytes(file, 2), ThreadLinkError);
  fs.chmodSync(file, 0o644);
  assert.throws(() => privateBytes(file, 128), ThreadLinkError);
  fs.chmodSync(file, 0o600);
  const alias = path.join(directory, "alias");
  fs.symlinkSync(file, alias);
  assert.throws(() => privateBytes(alias, 128));
  const linked = path.join(directory, "linked");
  fs.linkSync(file, linked);
  assert.throws(() => privateBytes(file, 128), ThreadLinkError);
  const actor = getPublicKey(ALICE);
  const base = {
    version: 1,
    channelId: TEST_CHANNEL,
    creatorEventId: "a".repeat(64),
    ownerPubkey: actor,
    purpose: "thread-link-smoke",
    expiresAt: 2000,
  };
  const bytes = Buffer.from(JSON.stringify(base));
  assert.equal(
    validateRegistration(bytes, TEST_CHANNEL, actor, 1000).digest,
    hash(bytes),
  );
  for (const patch of [
    { ownerPubkey: getPublicKey(BOB) },
    { purpose: "other" },
    { expiresAt: 999 },
    { expiresAt: 1000 + 8 * 86400 },
    { version: 2 },
    { creatorEventId: "short" },
    { extra: "source-data" },
  ]) {
    assert.throws(
      () =>
        validateRegistration(
          Buffer.from(JSON.stringify({ ...base, ...patch })),
          TEST_CHANNEL,
          actor,
          1000,
        ),
      ThreadLinkError,
    );
  }
});

test("signed private metadata, exact membership and creator are checked; archived channels refuse", async () => {
  const healthy = world();
  assert.equal(
    (await snapshot(healthy.client, healthy.channel)).projection.status,
    "complete",
  );
  const dm = world({ channel: DM });
  assert.equal((await snapshot(dm.client, DM)).summary.members.length, 2);
  for (const mode of [
    "archived",
    "public",
    "extra-member",
    "wrong-relay",
    "wrong-channel",
  ]) {
    const setup = world();
    const current = setup.metadata.get(39000);
    if (mode === "archived")
      setup.metadata.set(
        39000,
        setup.metadataEvent(39000, [...current.tags, ["archived", "true"]]),
      );
    if (mode === "public")
      setup.metadata.set(
        39000,
        setup.metadataEvent(39000, [
          ...current.tags.filter(([name]) => name !== "private"),
          ["public"],
        ]),
      );
    if (mode === "wrong-channel")
      setup.metadata.set(
        39000,
        setup.metadataEvent(
          39000,
          current.tags.map((tag) =>
            tag[0] === "d"
              ? ["d", "00000000-0000-0000-0000-000000000000"]
              : tag,
          ),
        ),
      );
    if (mode === "wrong-relay")
      setup.metadata.set(
        39000,
        finalizeEvent(
          { kind: 39000, created_at: 1, content: "", tags: current.tags },
          BOB,
        ),
      );
    if (mode === "extra-member")
      setup.metadata.set(
        39002,
        setup.metadataEvent(39002, [
          ...setup.metadata.get(39002).tags,
          ["p", getPublicKey(BOB), "", "member"],
        ]),
      );
    await assert.rejects(
      snapshot(setup.client, setup.channel),
      ThreadLinkError,
    );
    assert.equal(setup.submissions.length, 0);
  }
});

test("scope registration mutation and arbitrary query/filter kinds fail before network", async () => {
  const setup = world();
  for (const filter of [
    { kinds: [7], "#h": [setup.channel], limit: 1 },
    { kinds: [39000], "#d": [setup.channel], limit: 1, authors: [setup.actor] },
    { kinds: [9], "#h": [setup.channel], limit: 201 },
    { kinds: [9], "#h": ["00000000-0000-0000-0000-000000000000"], limit: 1 },
  ])
    await assert.rejects(setup.client.query(filter), ThreadLinkError);
  assert.equal(setup.requests.length, 0);
  setup.replaceRegistration({
    ...setup.registration(),
    digest: "b".repeat(64),
  });
  await assert.rejects(
    setup.client.query({ kinds: [9], "#h": [setup.channel], limit: 1 }),
    ThreadLinkError,
  );
  assert.equal(setup.requests.length, 0);
});

test("transport rejects ordinary messages, hidden fields and duplicate JSON body text", async () => {
  const setup = world();
  await assert.rejects(
    setup.client.submit(JSON.stringify(setup.child)),
    ThreadLinkError,
  );
  const operation = {
    operation: "link",
    childEventId: setup.child.id,
    parentEventId: setup.root.id,
    expectedHead: null,
  };
  const bytes = setup.client.signAnnotation(
    setup.channel,
    operation,
    setup.client.now(),
  );
  const extra = JSON.stringify({
    ...JSON.parse(bytes),
    hidden: "SYNTHETIC BODY MUST NOT LEAVE",
  });
  await assert.rejects(setup.client.submit(extra), ThreadLinkError);
  const duplicate = `{"content":"SYNTHETIC BODY MUST NOT LEAVE",${bytes.slice(1)}`;
  await assert.rejects(setup.client.submit(duplicate), ThreadLinkError);
  const arbitrary = finalizeEvent(
    {
      kind: 9,
      created_at: setup.client.now(),
      tags: JSON.parse(bytes).tags,
      content: "SYNTHETIC BODY MUST NOT LEAVE",
    },
    ALICE,
  );
  await assert.rejects(
    setup.client.submit(JSON.stringify(arbitrary)),
    ThreadLinkError,
  );
  assert.equal(JSON.parse(bytes).content, CONTENT);
  assert.equal(setup.requests.length, 0);
});

test("pagination proves timestamp boundaries and refuses a saturated second", async () => {
  const setup = world();
  setup.events.clear();
  for (let timestamp = 1; timestamp <= 201; timestamp++) {
    const event = message(setup.channel, timestamp);
    setup.events.set(event.id, event);
  }
  assert.equal(
    (await channelHistory(setup.client, setup.channel, 1000)).length,
    201,
  );
  setup.events.clear();
  for (let index = 0; index < 200; index++) {
    const event = finalizeEvent(
      {
        kind: 9,
        created_at: 100,
        content: `synthetic ${index}`,
        tags: [["h", setup.channel]],
      },
      ALICE,
    );
    setup.events.set(event.id, event);
  }
  await assert.rejects(
    channelHistory(setup.client, setup.channel, 1000),
    (error) => error.code === "history-saturated-second",
  );
});

test("fixed relay reads have a finite request budget and reject oversized/error responses", async () => {
  const setup = world();
  for (let index = 0; index < 400; index++) await setup.client.info();
  await assert.rejects(
    setup.client.info(),
    (error) => error.code === "operation-budget-exhausted",
  );
  const registration = setup.registration();
  const limited = createClient(ALICE, registration, {
    now: () => 10000,
    readRegistration: () => registration,
    fetchImpl: async () => new Response("x".repeat(65537)),
  });
  await assert.rejects(
    limited.info(),
    (error) => error.code === "response-bound",
  );
  const denied = createClient(ALICE, registration, {
    now: () => 10000,
    readRegistration: () => registration,
    fetchImpl: async () =>
      new Response("SYNTHETIC SERVER SECRET", { status: 403 }),
  });
  await assert.rejects(
    denied.query({ kinds: [9], "#h": [setup.channel], limit: 1 }),
    (error) =>
      error.code === "query-failed" && !error.message.includes("SECRET"),
  );
});

// Bind to the relay's real NIP-29 roster wire shape (side_effects.rs), not a mock-only shape.
test("member roster role is index three; compact or forged role shapes fail closed", async () => {
  const setup = world();
  const original = setup.metadata.get(39002);
  for (const bad of [
    ["p", setup.actor, "admin"],
    ["p", setup.actor, "admin", ""],
    ["p", setup.actor, "", "superuser"],
  ]) {
    setup.metadata.set(
      39002,
      setup.metadataEvent(39002, [["d", setup.channel], bad]),
    );
    await assert.rejects(
      snapshot(setup.client, setup.channel),
      (error) => error.code === "invalid-roster",
    );
  }
  setup.metadata.set(39002, original);
  const current = await snapshot(setup.client, setup.channel);
  assert.equal(current.summary.members[0].role, "admin");
  assert.equal(setup.submissions.length, 0);
});

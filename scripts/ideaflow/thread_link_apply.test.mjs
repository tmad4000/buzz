import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { applyPlan, verifyPlan } from "./thread_link_apply.mjs";
import { ThreadLinkError, hash } from "./thread_link_common.mjs";
import { journalStore } from "./thread_link_journal.mjs";
import { buildPlan } from "./thread_link_plan.mjs";
import { snapshot } from "./thread_link_snapshot.mjs";
import {
  BOB,
  FINGERPRINT,
  message,
  world,
} from "./thread_link_test.fixture.mjs";

const code = (expected) => (error) =>
  error instanceof ThreadLinkError && error.code === expected;

async function prepared(t, setup = world()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "buzz-thread-cli-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = journalStore(path.join(directory, "state"));
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
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  const digest = hash(bytes);
  const input = {
    client: setup.client,
    store,
    bytes,
    expectedDigest: digest,
    fingerprint: () => FINGERPRINT,
  };
  return { setup, directory, store, plan, bytes, digest, input };
}

test("all exact reviewed event bytes are durable before submit; readback and undo preserve originals", async (t) => {
  const state = await prepared(t);
  const { setup, store, digest, input } = state;
  const originals = JSON.stringify([setup.root, setup.child, setup.descendant]);
  setup.hooks.beforePost = (event) => {
    const persisted = store.read(digest);
    assert.equal(persisted.entries[0].state, "submitting");
    assert.equal(persisted.entries[0].eventId, event.id);
    assert.equal(persisted.entries[0].eventBytes, setup.submissions[0]);
    assert.equal(
      fs.statSync(path.join(store.root, digest, "journal.json")).mode & 0o777,
      0o600,
    );
    assert.equal(fs.statSync(store.root).mode & 0o777, 0o700);
  };
  const result = await applyPlan(input);
  assert.equal(result.uiVerified, false);
  assert.equal(result.operations[0].state, "verified");
  assert.equal(result.operations[0].relayAccepted, true);
  assert.equal(result.operations[0].projectionSelected, true);
  const beforeVerify = fs.readFileSync(
    path.join(store.root, digest, "journal.json"),
  );
  const verified = await verifyPlan(input);
  assert.equal(verified.operations[0].relayAccepted, true);
  assert.equal(verified.operations[0].projectionSelected, true);
  assert.equal(verified.reviewedOriginalsVerified, true);
  assert.deepEqual(
    fs.readFileSync(path.join(store.root, digest, "journal.json")),
    beforeVerify,
  );
  assert.equal(
    beforeVerify.includes(Buffer.from("SYNTHETIC SOURCE BODY")),
    false,
  );
  await applyPlan(input);
  assert.equal(setup.submissions.length, 1);
  assert.equal(
    JSON.stringify([setup.root, setup.child, setup.descendant]),
    originals,
  );

  setup.hooks.beforePost = null;
  setup.advance();
  const current = await snapshot(setup.client, setup.channel);
  const undo = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "unlink",
        childEventId: setup.child.id,
        parentEventId: null,
      },
    ],
    FINGERPRINT,
  );
  const undoBytes = Buffer.from(`${JSON.stringify(undo, null, 2)}\n`);
  const undoResult = await applyPlan({
    ...input,
    bytes: undoBytes,
    expectedDigest: hash(undoBytes),
  });
  assert.equal(undoResult.operations[0].projectionSelected, true);
  const restored = await snapshot(setup.client, setup.channel);
  assert.equal(
    restored.projection.messages.get(setup.child.id).presentationParentId,
    null,
  );
  assert.equal(
    restored.projection.messages.get(setup.descendant.id).canonicalRootId,
    setup.child.id,
  );
  assert.equal(setup.submissions.length, 2);
});

test("accepted then timed out resumes from exact readback with no second POST", async (t) => {
  const { setup, store, digest, input } = await prepared(t);
  setup.hooks.afterPost = () => {
    throw new Error("synthetic dropped response");
  };
  const uncertain = await applyPlan(input);
  assert.equal(uncertain.operations[0].state, "uncertain");
  assert.equal(uncertain.operations[0].relayAccepted, null);
  assert.equal(setup.submissions.length, 1);
  const originalBytes = store.read(digest).entries[0].eventBytes;
  setup.hooks.afterPost = null;
  const resumed = await applyPlan(input);
  assert.equal(resumed.operations[0].state, "verified");
  assert.equal(setup.submissions.length, 1);
  assert.equal(store.read(digest).entries[0].eventBytes, originalBytes);
});

test("unreceived timeout has no automatic retry; explicit resume reuses byte-identical event ID", async (t) => {
  const { setup, input } = await prepared(t);
  setup.hooks.beforePost = () => {
    throw new Error("synthetic connect lost");
  };
  const uncertain = await applyPlan(input);
  assert.equal(uncertain.operations[0].state, "uncertain");
  assert.equal(setup.submissions.length, 1);
  const firstBytes = setup.submissions[0];
  setup.hooks.beforePost = null;
  setup.advance();
  const resumed = await applyPlan(input);
  assert.equal(resumed.operations[0].attempts, 2);
  assert.equal(resumed.operations[0].state, "verified");
  assert.equal(setup.submissions.length, 2);
  assert.equal(setup.submissions[1], firstBytes);
});

test("uncertain old intent cannot be replaced through a new plan or a changed tool hash", async (t) => {
  const { setup, input } = await prepared(t);
  setup.hooks.beforePost = () => {
    throw new Error("synthetic timeout");
  };
  await applyPlan(input);
  setup.hooks.beforePost = null;
  await assert.rejects(
    applyPlan({ ...input, fingerprint: () => "b".repeat(64) }),
    code("tool-fingerprint-changed"),
  );
  setup.advance(901);
  await assert.rejects(applyPlan(input), code("signed-event-expired"));
  const current = await snapshot(setup.client, setup.channel);
  const replacement = buildPlan(
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
  const bytes = Buffer.from(`${JSON.stringify(replacement, null, 2)}\n`);
  await assert.rejects(
    applyPlan({ ...input, bytes, expectedDigest: hash(bytes) }),
    code("unresolved-previous-plan"),
  );
  assert.equal(setup.submissions.length, 1);
});

test("changed plan bytes, hidden body fields and noncanonical bytes never create a journal or POST", async (t) => {
  const { setup, store, plan, bytes, input } = await prepared(t);
  await assert.rejects(
    applyPlan({ ...input, expectedDigest: "f".repeat(64) }),
    code("reviewed-plan-digest-mismatch"),
  );
  const changed = Buffer.concat([bytes, Buffer.from(" ")]);
  await assert.rejects(
    applyPlan({ ...input, bytes: changed, expectedDigest: hash(changed) }),
    code("noncanonical-plan-bytes"),
  );
  const hidden = Buffer.from(
    `${JSON.stringify({ ...plan, sourceBody: "SYNTHETIC SOURCE BODY hidden" }, null, 2)}\n`,
  );
  await assert.rejects(
    applyPlan({ ...input, bytes: hidden, expectedDigest: hash(hidden) }),
    code("invalid-schema"),
  );
  assert.equal(fs.existsSync(store.root), false);
  assert.equal(setup.submissions.length, 0);
});

test("relay acceptance and projector selection are separate after a concurrent head wins", async (t) => {
  const { setup, input } = await prepared(t);
  const otherRoot = message(setup.channel, 13);
  // Re-plan after adding the root so the baseline contains it.
  setup.events.set(otherRoot.id, otherRoot);
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
  const bytes = Buffer.from(`${JSON.stringify(plan, null, 2)}\n`);
  setup.hooks.afterPost = () => {
    const competing = setup.client.signAnnotation(
      setup.channel,
      {
        operation: "link",
        childEventId: setup.child.id,
        parentEventId: otherRoot.id,
        expectedHead: null,
      },
      setup.client.now() - 1,
    );
    const event = JSON.parse(competing);
    setup.events.set(event.id, event);
  };
  const result = await applyPlan({
    ...input,
    bytes,
    expectedDigest: hash(bytes),
  });
  assert.equal(result.operations[0].relayAccepted, true);
  assert.equal(result.operations[0].projectionSelected, false);
  assert.equal(result.operations[0].state, "conflict");
  assert.equal(setup.submissions.length, 1);
});

test("cross-author plans remain proposals; no-op and cyclic plans are refused locally", async (t) => {
  const { setup, input } = await prepared(t);
  const foreign = message(setup.channel, 13, null, null, BOB);
  setup.events.set(foreign.id, foreign);
  const current = await snapshot(setup.client, setup.channel);
  const proposal = buildPlan(
    setup.client,
    current,
    [
      {
        operation: "link",
        childEventId: foreign.id,
        parentEventId: setup.root.id,
      },
    ],
    FINGERPRINT,
  );
  assert.equal(proposal.operations[0].eligibility, "proposal-only");
  assert.equal(proposal.operations[0].eventBytes, null);
  const bytes = Buffer.from(`${JSON.stringify(proposal, null, 2)}\n`);
  await assert.rejects(
    applyPlan({ ...input, bytes, expectedDigest: hash(bytes) }),
    code("not-child-author"),
  );
  assert.throws(
    () =>
      buildPlan(
        setup.client,
        current,
        [
          {
            operation: "link",
            childEventId: setup.descendant.id,
            parentEventId: setup.child.id,
          },
        ],
        FINGERPRINT,
      ),
    code("operation-already-matches"),
  );
  assert.throws(
    () =>
      buildPlan(
        setup.client,
        current,
        [
          {
            operation: "link",
            childEventId: setup.child.id,
            parentEventId: setup.descendant.id,
          },
        ],
        FINGERPRINT,
      ),
    code("prepared-annotation-not-selected"),
  );
  assert.equal(setup.submissions.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { forwardOnce, forwardReceipts, forwardRevision } from "./receipts.ts";
const storage = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => {
    if (failWrites) throw Error("full");
    storage.set(k, v);
  },
};
const ack = (id = "b".repeat(64)) => ({ id, pubkey: "self" });
test("no marker before acknowledgement; repeated/concurrent clicks send once and retain exact target ID", async () => {
  let resolve;
  let calls = 0;
  const send = () => {
    calls++;
    return new Promise((r) => (resolve = r));
  };
  const first = forwardOnce("scope", "source", "one", "p2", "P2", send, "self");
  const second = forwardOnce(
    "scope",
    "source",
    "one",
    "p2",
    "P2",
    send,
    "self",
  );
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual(forwardReceipts("scope", "one"), []);
  resolve(ack());
  await Promise.all([first, second]);
  assert.equal(forwardReceipts("scope", "one")[0].targetId, "b".repeat(64));
  await forwardOnce("scope", "source", "one", "p2", "P2", send, "self");
  assert.equal(calls, 1);
  assert.deepEqual(forwardReceipts("other-account", "one"), []);
});
test("failed/rejected send never marks source or manufactures an ID", async () => {
  await assert.rejects(
    forwardOnce(
      "scope",
      "source",
      "failure",
      "dm",
      "now",
      async () => {
        throw Error("rejected");
      },
      "self",
    ),
    /rejected/,
  );
  assert.deepEqual(forwardReceipts("scope", "failure"), []);
  await assert.rejects(
    forwardOnce(
      "scope",
      "source",
      "wrong-signer",
      "dm",
      "now",
      async () => ({ ...ack(), pubkey: "other" }),
      "self",
    ),
    /signer/,
  );
  assert.deepEqual(forwardReceipts("scope", "wrong-signer"), []);
  await assert.rejects(
    forwardOnce(
      "scope",
      "source",
      "pending",
      "dm",
      "now",
      async () => ({ ...ack(), pending: true }),
      "self",
    ),
    /signer/,
  );
});
test("marker persistence failure retains acknowledged ID; retry saves marker without forwarding twice", async () => {
  let calls = 0;
  const send = async () => {
    calls++;
    return ack("d".repeat(64));
  };
  failWrites = true;
  await assert.rejects(
    forwardOnce(
      "scope",
      "source",
      "save-failure",
      "hermes",
      "Hermes",
      send,
      "self",
    ),
    /Forward sent/,
  );
  assert.equal(
    forwardReceipts("scope", "save-failure")[0].targetId,
    "d".repeat(64),
  );
  assert.deepEqual(forwardReceipts("foreign-scope", "save-failure"), []);
  failWrites = false;
  await forwardOnce(
    "scope",
    "source",
    "save-failure",
    "hermes",
    "Hermes",
    send,
    "self",
  );
  assert.equal(calls, 1);
  assert.equal(forwardReceipts("scope", "save-failure").length, 1);
});

test("edited text has a distinct receipt; retries of that revision still do not resend", async () => {
  const first = await forwardRevision("original");
  const second = await forwardRevision("edited");
  assert.notEqual(first, second);
  let calls = 0;
  const send = async () => {
    calls++;
    return ack(String(calls).repeat(64));
  };
  await forwardOnce(
    "scope-edits",
    "source",
    "edit",
    "target",
    "Agent",
    send,
    "self",
    first,
  );
  await forwardOnce(
    "scope-edits",
    "source",
    "edit",
    "target",
    "Agent",
    send,
    "self",
    second,
  );
  await forwardOnce(
    "scope-edits",
    "source",
    "edit",
    "target",
    "Agent",
    send,
    "self",
    second,
  );
  assert.equal(calls, 2);
  assert.equal(forwardReceipts("scope-edits", "edit").length, 1);
  assert.equal(
    forwardReceipts("scope-edits", "edit")[0].targetId,
    "2".repeat(64),
  );
});

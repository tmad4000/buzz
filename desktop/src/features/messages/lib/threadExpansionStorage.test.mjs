import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveThreadExpansion,
  threadExpansionKey,
  loadThreadExpansion,
  saveThreadExpansion,
} from "./threadExpansionStorage.ts";
test("saved open and closed branches win; only unseen branches get unread defaults", () => {
  const saved = new Map([
    ["opened", true],
    ["closed", false],
    ["read", false],
  ]);
  const branches = ["opened", "closed", "read", "new-unread", "new-read"];
  const resolved = resolveThreadExpansion(
    saved,
    branches,
    new Set(["closed", "read", "new-unread"]),
  );
  assert.deepEqual(
    [...resolved],
    [
      ["opened", true],
      ["closed", false],
      ["read", false],
      ["new-unread", true],
      ["new-read", false],
    ],
  );
  assert.equal(
    resolveThreadExpansion(resolved, branches, new Set(["new-read"])),
    resolved,
  );
  assert.equal(
    resolveThreadExpansion(saved, branches, null),
    saved,
    "unknown read state cannot initialize preferences",
  );
  assert.equal(saved.size, 3, "resolver leaves prior snapshot immutable");
});
test("community, identity, channel and root are all storage boundaries", () => {
  const first = threadExpansionKey("community", "identity", "channel", "root");
  for (let index = 0; index < 4; index++) {
    const fields = ["community", "identity", "channel", "root"];
    fields[index] += "-other";
    assert.notEqual(threadExpansionKey(...fields), first);
  }
  assert.equal(threadExpansionKey(null, undefined, null, "root"), null);
  assert.equal(threadExpansionKey(null, undefined, "channel", null), null);
});
test("atomic snapshot round trip retains explicit false and rejects malformed entries", () => {
  const values = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  const state = new Map([
    ["open", true],
    ["closed", false],
  ]);
  assert.equal(saveThreadExpansion("key", state), true);
  assert.deepEqual([...loadThreadExpansion("key")], [...state]);
  values.set(
    "key",
    JSON.stringify([
      ["good", false],
      ["wrong", "false"],
      ["extra", true, 1],
      null,
      42,
    ]),
  );
  assert.deepEqual([...loadThreadExpansion("key")], [["good", false]]);
  assert.equal(loadThreadExpansion(null).size, 0);
});

test("view-scoped manual expansion keys isolate duplicates without changing legacy resource keys", () => {
  const legacy = threadExpansionKey("community", "identity", "channel", "root");
  const a = threadExpansionKey("community", "identity", "channel", "root", "a");
  const b = threadExpansionKey("community", "identity", "channel", "root", "b");
  assert.equal(
    legacy,
    'buzz-thread-expansion.v1:["community","identity","channel","root"]',
  );
  assert.notEqual(a, b);
  assert.notEqual(a, legacy);
  assert.equal(
    a,
    threadExpansionKey("community", "identity", "channel", "root", "a"),
  );
  assert.equal(
    threadExpansionKey("community", "identity", null, "root", "a"),
    null,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFlatThreadEntries,
  flatThreadViewKey,
  hasNestedReplies,
} from "./flatThreadView.ts";
import { buildThreadPanelIndex } from "./threadPanel.ts";

const message = (id, createdAt, parentId, depth) => ({
  id,
  createdAt,
  parentId,
  rootId: parentId ? "root" : null,
  depth,
  author: id,
  body: id,
});
const thread = [
  message("root", 1, null, 0),
  message("late", 9, "root", 1),
  message("early", 2, "root", 1),
  message("nested", 5, "early", 2),
  message("deep", 12, "nested", 3),
  message("orphan", 4, "missing", 2),
  { ...message("elsewhere", 3, null, 0) },
];
const index = buildThreadPanelIndex(thread);

test("flat thread lists every reply chronologically without changing parents", () => {
  const entries = buildFlatThreadEntries(index, "root");
  assert.deepEqual(
    entries.map(({ message }) => message.id),
    ["early", "orphan", "nested", "late", "deep"],
  );
  assert.ok(entries.every(({ message }) => message.depth === 1));
  assert.ok(entries.every(({ summary }) => summary === null));
  assert.equal(entries.at(-1).message.parentId, "nested");
  assert.equal(thread[4].depth, 3, "the source message is not rewritten");
});

test("a nested head flattens only its own branch and same-second replies tie by ID", () => {
  assert.deepEqual(
    buildFlatThreadEntries(index, "early").map(({ message }) => message.id),
    ["nested", "deep"],
  );
  const tied = buildThreadPanelIndex([
    message("root", 1, null, 0),
    message("b", 2, "root", 1),
    message("a", 2, "root", 1),
  ]);
  assert.deepEqual(
    buildFlatThreadEntries(tied, "root").map(({ message }) => message.id),
    ["a", "b"],
  );
});

test("unchanged replies keep their flattened identity for row memoization", () => {
  const first = buildFlatThreadEntries(index, "root");
  const second = buildFlatThreadEntries(index, "root");
  assert.equal(first[2].message, second[2].message);
});

test("a cyclic parent reference terminates", () => {
  const cyclic = buildThreadPanelIndex([
    message("root", 1, null, 0),
    message("x", 2, "y", 1),
    message("y", 3, "x", 1),
  ]);
  assert.deepEqual(
    buildFlatThreadEntries(cyclic, "root").map(({ message }) => message.id),
    ["x", "y"],
  );
});

test("the toggle is offered only for threads with nested replies", () => {
  assert.equal(hasNestedReplies(index, "root"), true);
  assert.equal(hasNestedReplies(index, "nested"), false);
  assert.equal(hasNestedReplies(index, null), false);
});

test("the remembered choice is separate per community, identity, channel and thread", () => {
  const keys = [
    flatThreadViewKey("a", "me", "c", "r"),
    flatThreadViewKey("b", "me", "c", "r"),
    flatThreadViewKey("a", "you", "c", "r"),
    flatThreadViewKey("a", "me", "d", "r"),
    flatThreadViewKey("a", "me", "c", "s"),
  ];
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(flatThreadViewKey("a", "me", null, "r"), null);
});

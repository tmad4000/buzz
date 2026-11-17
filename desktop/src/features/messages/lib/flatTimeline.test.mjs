import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFlatTimelineEntries,
  mergeTimelineReplyEvents,
} from "./flatTimeline.ts";

test("flat entries use timestamp then id, retain reply references, and never mutate source", () => {
  const root = { id: "root", createdAt: 1, depth: 0 };
  const a = {
    id: "a",
    createdAt: 2,
    depth: 2,
    parentId: "b",
    rootId: "root",
    tags: [["organization", "signed-annotation"]],
  };
  const b = {
    id: "b",
    createdAt: 2,
    depth: 1,
    parentId: "root",
    rootId: "root",
  };
  const source = [b, root, a];
  const entries = buildFlatTimelineEntries(source);
  assert.deepEqual(
    entries.map(({ message }) => message.id),
    ["root", "a", "b"],
  );
  assert.ok(
    entries.every(
      ({ message, summary }) => message.depth === 0 && summary === null,
    ),
  );
  assert.equal(entries[1].message.parentId, "b");
  assert.equal(entries[1].message.rootId, "root");
  assert.equal(entries[1].message.tags, a.tags);
  assert.deepEqual(source, [b, root, a]);
  assert.equal(a.depth, 2);
  const reorganized = buildFlatTimelineEntries([
    { ...a, parentId: "root", rootId: "other" },
    b,
    root,
  ]);
  assert.deepEqual(
    reorganized.map(({ message }) => message.id),
    ["root", "a", "b"],
  );
});

test("settled history merges once with deduplication; pending sends retain local row identity", () => {
  const base = {
    pubkey: "a".repeat(64),
    kind: 9,
    content: "Sent reply",
    created_at: 2,
    tags: [
      ["h", "channel"],
      ["e", "root", "", "reply"],
    ],
  };
  const root = {
    ...base,
    id: "root",
    content: "Root",
    created_at: 1,
    tags: [["h", "channel"]],
  };
  const sent = { ...base, id: "sent" };
  assert.deepEqual(
    mergeTimelineReplyEvents([root, sent], [sent]).map((event) => event.id),
    ["root", "sent"],
  );
  const pending = { ...base, id: "pending", pending: true };
  const merged = mergeTimelineReplyEvents([root, pending], [sent]);
  assert.deepEqual(
    merged.map((event) => event.id),
    ["root", "sent"],
  );
  assert.equal(merged[1].localKey, "pending");
});

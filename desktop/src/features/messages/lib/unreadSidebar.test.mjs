import assert from "node:assert/strict";
import test from "node:test";
import {
  unreadBranchPaths,
  sidebarReplies,
  sidebarVisualMessage,
} from "./unreadSidebar.ts";
const message = (id, parentId = null, createdAt = 1) => ({
  id,
  parentId,
  rootId: "root",
  createdAt,
  depth: 0,
  body: id,
  author: id,
  time: "now",
});
const messages = [
  message("root"),
  message("read", "root"),
  message("old", "read"),
  message("branch", "root"),
  message("deep", "branch"),
  message("unread", "deep", 5),
];
test("opens every unread ancestor while a fully read sibling stays summarized", () => {
  const paths = unreadBranchPaths(messages, new Set(["unread"]));
  assert.deepEqual([...paths.keys()], ["deep", "branch", "root"]);
  const expanded = new Set(paths.keys());
  const entries = sidebarReplies(messages, "root", expanded);
  assert.deepEqual(
    entries.map((e) => e.message.id),
    ["read", "branch", "deep", "unread"],
  );
  assert.equal(entries[0].summary.replyCount, 1);
});
test("malformed parent cycles terminate and do not invent ancestors", () => {
  const cycle = [message("a", "b"), message("b", "a")];
  assert.deepEqual([...unreadBranchPaths(cycle, new Set(["a"])).keys()], ["b"]);
  assert.equal(unreadBranchPaths(messages, new Set(["missing"])).size, 0);
});

test("visual cap preserves actual parents and stable message identity", () => {
  const original = { ...message("leaf", "deep"), depth: 9 };
  const visual = sidebarVisualMessage(original);
  assert.equal(visual.depth, 2);
  assert.equal(visual.parentId, "deep");
  assert.equal(original.depth, 9);
  assert.equal(sidebarVisualMessage(original), visual);
  const shallow = { ...message("branch", "root"), depth: 1 };
  assert.equal(sidebarVisualMessage(shallow), shallow);
});

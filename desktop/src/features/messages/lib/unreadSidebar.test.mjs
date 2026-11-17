import assert from "node:assert/strict";
import test from "node:test";
import {
  unreadBranchPaths,
  sidebarExpansion,
  sidebarReplies,
  sidebarVisualMessage,
  latchSidebarExpansion,
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
  const expanded = sidebarExpansion(paths, new Set(), new Map());
  const entries = sidebarReplies(messages, "root", expanded);
  assert.deepEqual(
    entries.map((e) => e.message.id),
    ["read", "branch", "deep", "unread"],
  );
  assert.equal(entries[0].summary.replyCount, 1);
});
test("manual collapse remains until a genuinely new unread descendant; latched reads stay open", () => {
  const paths = unreadBranchPaths(messages, new Set(["unread"]));
  const collapsed = new Map([["branch", new Set(["unread"])]]);
  assert.equal(
    sidebarExpansion(paths, new Set(["branch"]), collapsed).has("branch"),
    false,
  );
  const more = unreadBranchPaths(
    [...messages, message("new", "deep", 6)],
    new Set(["unread", "new"]),
  );
  assert.equal(
    sidebarExpansion(more, new Set(), collapsed).has("branch"),
    true,
  );
  assert.equal(
    sidebarExpansion(new Map(), new Set(["branch"]), new Map()).has("branch"),
    true,
  );
});
test("malformed parent cycles terminate and do not invent ancestors", () => {
  const cycle = [message("a", "b"), message("b", "a")];
  assert.deepEqual([...unreadBranchPaths(cycle, new Set(["a"])).keys()], ["b"]);
  assert.equal(unreadBranchPaths(messages, new Set(["missing"])).size, 0);
});

test("new unread on the same ancestry clears stale manual collapse and remains open after read", () => {
  const first = unreadBranchPaths(messages, new Set(["unread"]));
  const collapsed = new Map([["branch", new Set(["unread"])]]);
  const more = unreadBranchPaths(
    [...messages, message("later", "deep", 8)],
    new Set(["unread", "later"]),
  );
  const latched = latchSidebarExpansion(
    more,
    new Set(["root", "deep"]),
    collapsed,
  );
  assert.equal(latched.collapsed.has("branch"), false);
  assert.equal(
    sidebarExpansion(new Map(), latched.opened, latched.collapsed).has(
      "branch",
    ),
    true,
  );
  assert.equal(
    sidebarExpansion(first, new Set(), collapsed).has("branch"),
    false,
  );
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

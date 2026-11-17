import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildMainTimelineEntries } from "./threadPanel.ts";
import { selectBufferedTimelineMessages } from "../ui/useBufferedTimelineMessages.ts";
import { unseenRepliesByRoot } from "@/features/channels/lib/unseenReplies";

const root = {
  id: "root",
  createdAt: 1,
  pubkey: "bob",
  author: "Bob",
  body: "Root",
  parentId: null,
  rootId: null,
  depth: 0,
  kind: 9,
  tags: [],
};
const reply = (id, createdAt) => ({
  ...root,
  id,
  createdAt,
  body: "Same text",
  parentId: root.id,
  rootId: root.id,
  depth: 1,
});
const first = reply("first", 2);
const second = reply("second", 3);
const staleRelay = new Map([
  [
    root.id,
    { descendantCount: 1, lastReplyAt: 2, participantPubkeys: ["bob"] },
  ],
]);
function project(current, frozenIds = [root.id, first.id], relay = staleRelay) {
  const rendered = selectBufferedTimelineMessages({
    frozenMessageIds: frozenIds,
    isAtBottom: false,
    messages: current,
  });
  return {
    rendered,
    entries: buildMainTimelineEntries(
      rendered,
      new Set(),
      relay,
      undefined,
      current,
    ),
    unseen: unseenRepliesByRoot(current, "reader", () => null),
  };
}
test("live reply updates total and unseen while reading body rows stay frozen", () => {
  const before = project([root, first]);
  assert.equal(before.entries[0].summary.replyCount, 1);
  assert.equal(before.unseen.get(root.id).length, 1);
  const after = project([root, first, second]);
  assert.deepEqual(
    after.rendered.map((m) => m.id),
    [root.id, first.id],
  );
  assert.deepEqual(
    after.entries.map((entry) => entry.message.id),
    [root.id],
  );
  assert.equal(after.entries[0].summary.replyCount, 2);
  assert.equal(after.entries[0].summary.lastReplyAt, 3);
  assert.equal(
    after.unseen.get(root.id).length,
    2,
    "same-text siblings are distinct events",
  );
});
test("live summary evidence does not insert buffered roots or change body object identity", () => {
  const laterRoot = { ...root, id: "later-root", createdAt: 4 };
  const { entries, rendered } = project([root, first, second, laterRoot]);
  assert.deepEqual(
    entries.map((entry) => entry.message.id),
    [root.id],
  );
  assert.equal(rendered[0] === root, true);
  assert.equal(rendered[1] === first, true);
});
test("relay total remains a floor and duplicate IDs do not inflate unseen", () => {
  const floor = new Map([
    [
      root.id,
      { descendantCount: 5, lastReplyAt: 7, participantPubkeys: ["bob"] },
    ],
  ]);
  const { entries, unseen } = project(
    [root, first, second, second],
    undefined,
    floor,
  );
  assert.equal(entries[0].summary.replyCount, 5);
  assert.equal(entries[0].summary.lastReplyAt, 7);
  assert.equal(unseen.get(root.id).length, 2);
});
test("default summary derivation still uses only its supplied bodies", () => {
  const [entry] = buildMainTimelineEntries([root, first]);
  assert.equal(entry.summary.replyCount, 1);
});

test("actual list selector uses live evidence while retaining frozen body membership", () => {
  const source = ts.createSourceFile(
    "TimelineMessageList.tsx",
    readFileSync(
      new URL("../ui/TimelineMessageList.tsx", import.meta.url),
      "utf8",
    ),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let selector;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      node.name.getText(source) === "entries" &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(source) === "React.useMemo"
    )
      selector = node.initializer.arguments[0].getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(selector);
  const select = new Function(
    "mainEntries",
    "mode",
    "messages",
    "threadSummaries",
    "profiles",
    "summaryMessages",
    "buildFlatTimelineEntries",
    "buildMainTimelineEntries",
    ts.transpile(`return (${selector})();`, { target: ts.ScriptTarget.ES2022 }),
  );
  const rendered = [root, first];
  const entries = select(
    undefined,
    "threads",
    rendered,
    staleRelay,
    undefined,
    [root, first, second],
    () => {
      throw new Error("unexpected flat mode");
    },
    buildMainTimelineEntries,
  );
  assert.deepEqual(
    entries.map((entry) => entry.message.id),
    [root.id],
  );
  assert.equal(entries[0].summary.replyCount, 2);
  assert.equal(rendered.length, 2);
});

test("repeated canonical evidence cannot inflate total or unseen", () => {
  const { entries, unseen } = project([root, first, second, { ...second }]);
  assert.equal(entries[0].summary.replyCount, 2);
  assert.equal(unseen.get(root.id).length, 2);
});

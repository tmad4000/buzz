import assert from "node:assert/strict";
import { test } from "node:test";
import { threadParentQuote } from "./threadParentQuote.ts";

const parent = {
  id: "parent",
  body: "Latest edited first line\nPrivate second line",
};
const messages = new Map([[parent.id, parent]]);
const reply = {
  id: "child",
  parentId: "presentation-parent",
  rootId: "presentation-root",
  tags: [
    ["h", "channel"],
    ["e", "root", "", "root"],
    ["e", "parent", "", "reply"],
  ],
};
test("native nested reply quotes only the parent's current first line, independent of presentation depth", () => {
  assert.deepEqual(threadParentQuote(reply, messages, "channel"), {
    parentId: "parent",
    rootId: "root",
    parentLoaded: true,
    excerpt: "Latest edited first line",
  });
});
test("root replies, self references and messages without native reply tags have no quote", () => {
  for (const message of [
    { ...reply, tags: [["e", "root", "", "reply"]] },
    { ...reply, id: "parent" },
    { ...reply, tags: [] },
  ])
    assert.equal(threadParentQuote(message, messages, "channel"), null);
});
test("unloaded and nontext parents keep exact native jump identity without inventing a quote", () => {
  assert.equal(
    threadParentQuote(reply, new Map(), "channel").excerpt,
    "reply to earlier message",
  );
  assert.equal(
    threadParentQuote(
      reply,
      new Map([["parent", { ...parent, body: "\nattachment" }]]),
      "channel",
    ).excerpt,
    "Message without text",
  );
});
test("cross-channel or ambiguous channel tags never expose a parent chip", () => {
  assert.equal(threadParentQuote(reply, messages, "another"), null);
  assert.equal(
    threadParentQuote(
      { ...reply, tags: [...reply.tags, ["h", "channel"]] },
      messages,
      "channel",
    ),
    null,
  );
});

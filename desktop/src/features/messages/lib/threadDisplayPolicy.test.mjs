import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialBranchChoice,
  isShortThreadReply,
  smartThreadDecision,
  threadDisplayKey,
  loadThreadDisplayPolicy,
} from "./threadDisplayPolicy.ts";
const msg = (id, body, parentId = null, extra = {}) => ({
  id,
  body,
  parentId,
  createdAt: 1,
  author: "Alex",
  depth: 0,
  time: "now",
  ...extra,
});
const root = msg("root", "Which build?", null, { pubkey: "me" });
test("historical read Q&A and authoritative agent reply to imperative need no unread/age signal", () => {
  assert.deepEqual(
    smartThreadDecision(root, [msg("a", "Build 7.", "root")], 1, "me", 1e9),
    { kind: "answer", answerId: "a" },
  );
  assert.deepEqual(
    smartThreadDecision(
      { ...root, body: "Check CI" },
      [msg("a", "Passed.", "root", { isAgent: true })],
      1,
      "me",
      1e9,
    ),
    { kind: "answer", answerId: "a" },
  );
  assert.equal(
    smartThreadDecision(
      { ...root, body: "Check CI" },
      [msg("a", "Passed.", "root", { author: "Agent" })],
      1,
      "me",
      1e9,
    ),
    null,
  );
});
test("pending, long and unknown-count answers do not auto-open", () => {
  for (const reply of [
    msg("a", "Working", "root", { pending: true }),
    msg("a", "x".repeat(601), "root"),
  ])
    assert.equal(smartThreadDecision(root, [reply], 1), null);
  assert.equal(
    smartThreadDecision(root, [msg("a", "Answer", "root")], null),
    null,
  );
  assert.deepEqual(smartThreadDecision(root, [msg("a", "Answer", "root")], 1), {
    kind: "answer",
    answerId: "a",
  });
});
test("compact recent roots require complete and collectively bounded bodies", () => {
  const r = { ...root, body: "Planning" };
  const a = msg("a", "Good", "root");
  assert.deepEqual(smartThreadDecision(r, [a], 1, undefined, 2), {
    kind: "compact",
  });
  assert.equal(smartThreadDecision(r, [a], 2, undefined, 2), null);
  assert.equal(smartThreadDecision(r, [a], 1, undefined, 90000), null);
  assert.equal(
    smartThreadDecision(
      r,
      [
        msg("a", "x".repeat(600), "root"),
        msg("b", "x".repeat(600), "root"),
        msg("c", "x", "root"),
      ],
      3,
      undefined,
      2,
    ),
    null,
  );
});
test("legacy true/false beat all policies; Smart unknown branches do not mutate saved state", () => {
  const saved = new Map([
    ["closed", false],
    ["open", true],
  ]);
  for (const mode of ["collapsed", "smart", "expanded"]) {
    assert.equal(initialBranchChoice(saved, "closed", mode, 1, true), false);
    assert.equal(initialBranchChoice(saved, "open", mode, 100, false), true);
  }
  assert.equal(initialBranchChoice(saved, "new", "smart", 4, false), true);
  assert.equal(initialBranchChoice(saved, "new", "smart", 5, false), false);
  assert.equal(initialBranchChoice(saved, "new", "smart", 100, true), true);
  assert.equal(initialBranchChoice(saved, "new", "collapsed", 1, true), false);
  assert.equal(saved.size, 2);
});
test("short bodies count code points/authored lines and reject attachments/code", () => {
  assert.equal(isShortThreadReply(msg("a", "😀".repeat(600))), true);
  assert.equal(
    isShortThreadReply(msg("a", "ordinary letters n r u 2 8 9 ".repeat(4))),
    true,
  );
  assert.equal(isShortThreadReply(msg("a", "line\r".repeat(8))), false);
  assert.equal(isShortThreadReply(msg("a", "line\u2028".repeat(8))), false);
  for (const body of [
    "😀".repeat(601),
    "line\n".repeat(8),
    "```js\nx\n```",
    "![image](url)",
  ])
    assert.equal(isShortThreadReply(msg("a", body)), false);
  assert.equal(
    isShortThreadReply(msg("a", "text", null, { tags: [["imeta", "url x"]] })),
    false,
  );
});
test("personal preference scope and validation default safely to Smart/Smart", () => {
  const key = threadDisplayKey("c", "me");
  assert.notEqual(key, threadDisplayKey("c", "other"));
  assert.notEqual(key, threadDisplayKey("other", "me"));
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      getItem: () => '{"channels":"expanded","replies":"invalid"}',
    },
  };
  try {
    assert.deepEqual(loadThreadDisplayPolicy(key), {
      channels: "expanded",
      replies: "smart",
    });
    globalThis.window.localStorage.getItem = () => {
      throw Error("unavailable");
    };
    assert.deepEqual(loadThreadDisplayPolicy(key), {
      channels: "smart",
      replies: "smart",
    });
  } finally {
    globalThis.window = previous;
  }
});

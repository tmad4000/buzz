import assert from "node:assert/strict";
import test from "node:test";
import { replyEvidenceComplete } from "./replyEvidenceComplete.ts";
const root = "a".repeat(64);
const reply = (id, created_at = 20) => ({
  id,
  created_at,
  kind: 9,
  tags: [
    ["e", root, "", "root"],
    ["e", root, "", "reply"],
  ],
});
const summary = { descendantCount: 2, lastReplyAt: 20 };
test("successful empty, partial, duplicate and stale body fetches cannot clear summary uncertainty", () => {
  assert.equal(replyEvidenceComplete([], root, summary), false);
  assert.equal(replyEvidenceComplete([reply("one")], root, summary), false);
  assert.equal(
    replyEvidenceComplete([reply("one"), reply("one")], root, summary),
    false,
  );
  assert.equal(
    replyEvidenceComplete([reply("one", 19), reply("two", 19)], root, summary),
    false,
  );
  assert.equal(
    replyEvidenceComplete([reply("one"), reply("two")], root, summary),
    true,
  );
});

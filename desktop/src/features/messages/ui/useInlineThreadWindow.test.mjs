import assert from "node:assert/strict";
import test from "node:test";
import { inlineThreadCacheChanged } from "./useInlineThreadWindow.ts";
const pending = {
  id: "outbox-local:one",
  pubkey: "owner",
  kind: 9,
  created_at: 1,
  tags: [
    ["h", "channel"],
    ["e", "root", "", "root"],
    ["e", "branch", "", "reply"],
  ],
  content: "body",
  sig: "",
  pending: true,
};
test("inline cache admission and deletion both repaint relevant durable replies", () => {
  const loaded = new Set(["branch"]);
  assert.equal(
    inlineThreadCacheChanged(new Map(), [pending], "root", loaded),
    true,
  );
  assert.equal(
    inlineThreadCacheChanged(
      new Map([[pending.id, pending]]),
      [],
      "root",
      loaded,
    ),
    true,
  );
  assert.equal(
    inlineThreadCacheChanged(
      new Map([[pending.id, pending]]),
      [pending],
      "root",
      loaded,
    ),
    false,
  );
});
test("inline cache ignores unrelated removal and admits actual accepted replacement", () => {
  const other = {
    ...pending,
    id: "other",
    tags: [["e", "elsewhere", "", "reply"]],
  };
  assert.equal(
    inlineThreadCacheChanged(
      new Map([[other.id, other]]),
      [],
      "root",
      new Set(),
    ),
    false,
  );
  const accepted = { ...pending, id: "signed", pending: false };
  assert.equal(
    inlineThreadCacheChanged(
      new Map([[pending.id, pending]]),
      [accepted],
      "root",
      new Set(),
    ),
    true,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import { unseenRepliesByRoot } from "./unseenReplies.ts";
const reply = (id, extra = {}) => ({
  id,
  rootId: "root",
  parentId: "root",
  createdAt: 20,
  pubkey: "agent",
  ...extra,
});
test("seen is per reply: partial reads, duplicates, own and pending replies", () => {
  const messages = [
    reply("seen"),
    reply("new"),
    reply("new"),
    reply("own", { pubkey: "me" }),
    reply("pending", { pending: true }),
    reply("nested", { parentId: "new" }),
    reply("elsewhere", { rootId: "other" }),
  ];
  const markers = new Map([["root:seen", 20]]);
  const result = unseenRepliesByRoot(
    messages,
    "me",
    (root, id) => markers.get(`${root}:${id}`) ?? null,
  );
  assert.deepEqual(
    [...result].map(([root, replies]) => [root, replies.map((x) => x.id)]),
    [
      ["root", ["new", "nested"]],
      ["other", ["elsewhere"]],
    ],
  );
  assert.equal(unseenRepliesByRoot(messages, undefined, () => null).size, 0);
});
test("projection uses the retained canonical-root marker without a second age filter", () => {
  const messages = [reply("a", { createdAt: 1 }), reply("b")];
  assert.equal(
    unseenRepliesByRoot(messages, "me", (root, id) =>
      root === "root" && id === "a" ? 1 : null,
    ).get("root").length,
    1,
  );
  assert.equal(unseenRepliesByRoot(messages, "me", () => 100).size, 0);
});

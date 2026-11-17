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

test("unseen badges share exact observation evidence with sidebar folding", async () => {
  const { resolveThreadReplyObservedAt, threadSeenKey, threadReplySeenKey } =
    await import("../readState/threadReplySeen.ts");
  const markers = new Map([
    [threadSeenKey("root"), 200],
    [threadReplySeenKey("root", "newer"), 200],
    [threadReplySeenKey("root", "stale"), 90],
  ]);
  const seenAt = (root, id) =>
    resolveThreadReplyObservedAt(root, id, (key) => markers.get(key) ?? null);
  const result = unseenRepliesByRoot(
    [
      reply("older", { createdAt: 100 }),
      reply("stale", { createdAt: 101 }),
      reply("newer", { createdAt: 200 }),
    ],
    "me",
    seenAt,
  );
  assert.deepEqual(
    result.get("root").map((m) => m.id),
    ["older", "stale"],
  );
});

test("organization groups unseen replies by presentation but retains native exact-marker keys", () => {
  const messages = [
    reply("native-C", { canonicalRootId: null }),
    reply("native-D", { canonicalRootId: "native-C", parentId: "native-C" }),
  ];
  const markers = new Map([
    ["native-C:native-C", 20],
    ["native-C:native-D", 20],
  ]);
  assert.equal(
    unseenRepliesByRoot(
      messages,
      "me",
      (root, id) => markers.get(`${root}:${id}`) ?? null,
    ).size,
    0,
  );
  markers.delete("native-C:native-D");
  assert.deepEqual(
    unseenRepliesByRoot(
      messages,
      "me",
      (root, id) => markers.get(`${root}:${id}`) ?? null,
    )
      .get("root")
      .map((m) => m.id),
    ["native-D"],
  );
});

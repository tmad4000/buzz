import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchOriginTags,
  partitionDispatchOriginTags,
  retainDispatchOriginForEdit,
  getDispatchOrigin,
  withDispatchTraces,
} from "./dispatchTrace.ts";
const channel = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const source = (extra = {}) => ({
  id: "reply",
  parentId: "root",
  rootId: "root",
  kind: 9,
  createdAt: 2,
  author: "Jacob",
  body: "answer",
  depth: 1,
  time: "now",
  tags: [
    ["h", channel],
    ["origin", channel, "main"],
  ],
  ...extra,
});
test("only an explicit main-composer routing choice writes same-channel origin", () => {
  assert.deepEqual(dispatchOriginTags(channel, "root", false), [
    ["origin", channel, "main"],
  ]);
  for (const choice of [undefined, null, ""])
    assert.deepEqual(dispatchOriginTags(channel, choice, false), []);
  assert.deepEqual(dispatchOriginTags(channel, "child", true), []);
  assert.deepEqual(dispatchOriginTags(null, "root", false), []);
  assert.deepEqual(dispatchOriginTags("invalid", "root", false), []);
});
test("origin extraction isolates dedicated metadata without permitting tag injection or ambiguity", () => {
  const origin = ["origin", channel, "main"],
    media = ["imeta", "url x"],
    mention = ["mention", "key"];
  assert.deepEqual(partitionDispatchOriginTags([media, origin, mention]), {
    dispatchOriginTag: origin,
    otherTags: [media, mention],
  });
  for (const tags of [
    [origin, origin],
    [["origin", channel, "main", "extra"]],
    [["origin", other, "dm"]],
    [["origin", "wrong", "main"]],
  ])
    assert.throws(() => partitionDispatchOriginTags(tags), /Invalid dispatch/);
  assert.deepEqual(
    partitionDispatchOriginTags([["h", other]]).otherTags,
    [["h", other]],
    "unknown semantic tags stay on native-rejected media path",
  );
});
test("reader rejects pending/local/top-level/foreign/multiple-scope/malformed origin claims", () => {
  assert.equal(getDispatchOrigin(source(), channel), channel);
  for (const message of [
    source({ pending: true }),
    source({ id: "outbox-local:reply" }),
    source({ parentId: null }),
    source({ kind: 40003 }),
    source({
      tags: [
        ["h", other],
        ["origin", channel, "main"],
      ],
    }),
    source({
      tags: [
        ["h", channel],
        ["h", other],
        ["origin", channel, "main"],
      ],
    }),
    source({
      tags: [
        ["h", channel],
        ["origin", channel, "main"],
        ["origin", channel, "main"],
      ],
    }),
  ])
    assert.equal(getDispatchOrigin(message, channel), null);
});
test("derived stub preserves canonical source identity once, orders normally and follows edits/deletes", () => {
  const root = { id: "root", kind: 9, body: "topic", createdAt: 1, depth: 0 },
    reply = source();
  const entries = [{ message: root, summary: null }],
    messages = [root, reply];
  const projected = withDispatchTraces(entries, messages, channel);
  assert.equal(projected.length, 2);
  assert.equal(projected[1].message, reply);
  assert.equal(projected[1].message.id, "reply");
  assert.equal(projected[1].dispatchTrace.root, root);
  assert.equal(reply.parentId, "root");
  assert.equal(withDispatchTraces(projected, messages, channel).length, 2);
  assert.equal(
    withDispatchTraces([{ message: reply, summary: null }], messages, channel)
      .length,
    1,
    "flat mode already renders this same source",
  );
  assert.equal(
    withDispatchTraces(entries, [root, source({ body: "edited" })], channel)[1]
      .message.body,
    "edited",
  );
  assert.equal(
    withDispatchTraces(entries, [root], channel).length,
    1,
    "deleted source creates no orphan trace",
  );
  assert.equal(entries.length, 1);
  assert.equal(messages.length, 2);
});
test("missing root reveals no invented target text and foreign channel never gets same-channel trace", () => {
  const projected = withDispatchTraces([], [source()], channel);
  assert.equal(projected[0].dispatchTrace.root, null);
  assert.equal(withDispatchTraces([], [source()], other).length, 0);
});

test("existing authorized edit overlay preserves immutable signed origin and ignores edit attempts to move it", async (t) => {
  let applyEditTagOverlay;
  try {
    ({ applyEditTagOverlay } = await import("./applyEditTagOverlay.mjs"));
  } catch (error) {
    if (
      error.code === "ERR_MODULE_NOT_FOUND" &&
      /nostr-tools/.test(error.message)
    ) {
      t.skip(
        "Full dependency edit-overlay regression pending; no install under source-only slot.",
      );
      return;
    }
    throw error;
  }
  const original = source();
  const tags = applyEditTagOverlay(original.tags, [
    ["origin", other, "main"],
    ["imeta", "url attachment"],
    ["buzz:mention-snapshot", "1"],
  ]);
  assert.equal(getDispatchOrigin({ ...original, tags }, channel), channel);
  assert.equal(tags.filter((tag) => tag[0] === "origin").length, 1);
  assert.ok(tags.some((tag) => tag[0] === "imeta"));
});

test("queued edit preserves original provenance, cannot create/move it and leaves new content/media intact", () => {
  const original = source().tags,
    replacement = [
      ["origin", other, "main"],
      ["imeta", "url newer"],
      ["mention", "person"],
    ];
  const retained = retainDispatchOriginForEdit(original, replacement);
  assert.deepEqual(
    retained.filter((tag) => tag[0] === "origin"),
    [["origin", channel, "main"]],
  );
  assert.ok(retained.some((tag) => tag[0] === "imeta"));
  assert.ok(retained.some((tag) => tag[0] === "mention"));
  assert.deepEqual(
    retainDispatchOriginForEdit([], replacement),
    replacement.slice(1),
  );
  assert.deepEqual(retainDispatchOriginForEdit(original, []), [
    ["origin", channel, "main"],
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  PASEO_PUBKEY,
  isOwnEditedMessage,
  hasResendMembership,
  resendTemplate,
  isPaseoAcknowledgement,
  receiptKey,
} from "./protocol.ts";
const actor = "a".repeat(64),
  id = "1".repeat(64),
  edit = "2".repeat(64);
const msg = {
  id,
  editEventId: edit,
  edited: true,
  pubkey: actor,
  signerPubkey: actor,
  kind: 9,
  tags: [["h", "channel"]],
};
test("resend is explicit original-author delivered edit only", () => {
  assert.equal(isOwnEditedMessage(msg, actor, "channel"), true);
  for (const override of [
    { pending: true },
    { edited: false },
    { editEventId: undefined },
    { editEventId: "bad" },
    { kind: 45001 },
    { pubkey: "b".repeat(64) },
    { signerPubkey: "b".repeat(64) },
    { tags: [["h", "elsewhere"]] },
  ])
    assert.equal(
      isOwnEditedMessage({ ...msg, ...override }, actor, "channel"),
      false,
      JSON.stringify(override),
    );
  assert.equal(isOwnEditedMessage(msg, undefined, "channel"), false);
  assert.equal(isOwnEditedMessage(msg, actor, null), false);
  assert.equal(
    isOwnEditedMessage(
      {
        ...msg,
        pubkey: actor.toUpperCase(),
        signerPubkey: actor.toUpperCase(),
      },
      actor,
      "channel",
    ),
    true,
  );
});
test("channel and DM membership requires actual canonical Paseo key, not a name", () => {
  const channel = { isMember: true, archivedAt: null };
  const members = [{ pubkey: actor }, { pubkey: PASEO_PUBKEY }];
  for (const channelType of ["stream", "forum", "dm"])
    assert.equal(
      hasResendMembership({ ...channel, channelType }, members, actor),
      true,
    );
  for (const [c, m, a] of [
    [undefined, members, actor],
    [channel, undefined, actor],
    [{ ...channel, isMember: false }, members, actor],
    [{ ...channel, archivedAt: "now" }, members, actor],
    [
      channel,
      [{ pubkey: actor }, { pubkey: "b".repeat(64), displayName: "Paseo" }],
      actor,
    ],
    [channel, members, "b".repeat(64)],
  ])
    assert.equal(hasResendMembership(c, m, a), false);
});
test("wire trigger binds original + exact named edit and has exactly the agreed four tags", () => {
  assert.deepEqual(resendTemplate("channel", id, edit), {
    kind: 7,
    content: "🔁",
    tags: [
      ["h", "channel"],
      ["e", id],
      ["edit", edit],
      ["t", "paseo-resend-v1"],
    ],
  });
  assert.throws(() => resendTemplate("channel", id, "bad"));
  assert.notEqual(
    receiptKey("a", actor, "channel", id, edit),
    receiptKey("b", actor, "channel", id, edit),
  );
});
test("canonical Paseo eyes bind exact trigger, allow absent h and reject conflicting/duplicate references", () => {
  const ack = {
    kind: 7,
    pubkey: PASEO_PUBKEY,
    content: "👀",
    tags: [
      ["h", "channel"],
      ["e", id],
    ],
  };
  assert.equal(isPaseoAcknowledgement(ack, "channel", id), true);
  assert.equal(
    isPaseoAcknowledgement({ ...ack, tags: [["e", id]] }, "channel", id),
    true,
  );
  for (const e of [
    { ...ack, pubkey: actor },
    { ...ack, content: "🔁" },
    { ...ack, kind: 40003 },
    {
      ...ack,
      tags: [
        ["h", "other"],
        ["e", id],
      ],
    },
    {
      ...ack,
      tags: [
        ["h", "channel"],
        ["e", edit],
      ],
    },
    { ...ack, tags: [...ack.tags, ["e", edit]] },
    { ...ack, tags: [...ack.tags, ["h", "channel"]] },
    { ...ack, tags: [...ack.tags, ["h", "other"]] },
    {
      ...ack,
      tags: [
        ["e", id],
        ["e", id],
      ],
    },
  ])
    assert.equal(isPaseoAcknowledgement(e, "channel", id), false);
});

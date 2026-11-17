import assert from "node:assert/strict";
import test from "node:test";
import { requestPaseoResend } from "./service.ts";
import { PASEO_PUBKEY, receiptKey } from "./protocol.ts";
import { getResendReceipt, setResendReceipt } from "./receiptStore.ts";
const actor = "a".repeat(64);
let seq = 0;
const setup = () => {
  const id = (++seq).toString(16).padStart(64, "0"),
    edit = (100 + seq).toString(16).padStart(64, "0");
  const message = {
    id,
    editEventId: edit,
    edited: true,
    pubkey: actor,
    signerPubkey: actor,
    kind: 9,
    tags: [["h", "channel"]],
  };
  let community = "one";
  let activeActor = actor;
  const signed = [],
    published = [];
  const deps = {
    community: () => community,
    identity: async () => ({ pubkey: activeActor }),
    details: async () => ({ isMember: true, archivedAt: null }),
    members: async () => [{ pubkey: actor }, { pubkey: PASEO_PUBKEY }],
    sign: async (input) => {
      signed.push(input);
      return {
        ...input,
        id: (200 + seq).toString(16).padStart(64, "0"),
        pubkey: actor,
        sig: "relay-signing-boundary",
        created_at: 10,
      };
    },
    publish: async (event) => {
      published.push(event);
    },
  };
  const key = receiptKey(community, actor, "channel", id, edit);
  return {
    message,
    deps,
    signed,
    published,
    key,
    isCurrentIdentity: () => activeActor === actor,
    switchIdentity: () => {
      activeActor = "b".repeat(64);
    },
    switchCommunity: () => {
      community = "two";
    },
  };
};
test("relay acceptance remains Pending, double activation publishes once and captures named revision", async () => {
  const f = setup();
  const a = requestPaseoResend(
      f.message,
      "channel",
      actor,
      f.isCurrentIdentity,
      f.deps,
    ),
    b = requestPaseoResend(
      f.message,
      "channel",
      actor,
      f.isCurrentIdentity,
      f.deps,
    );
  assert.equal(a, b);
  await a;
  assert.equal(f.published.length, 1);
  assert.equal(f.signed.length, 1);
  assert.equal(getResendReceipt(f.key).phase, "pending");
  assert.deepEqual(
    f.published[0].tags.find((t) => t[0] === "edit"),
    ["edit", f.message.editEventId],
  );
  await requestPaseoResend(
    f.message,
    "channel",
    actor,
    f.isCurrentIdentity,
    f.deps,
  );
  assert.equal(
    f.published.length,
    1,
    "pending activation cannot create another trigger",
  );
});
test("failed publication is not Sent; explicit retry reuses the identical signed trigger", async () => {
  const f = setup();
  let calls = 0;
  f.deps.publish = async (event) => {
    f.published.push(event);
    if (++calls === 1) throw new Error("offline");
  };
  await assert.rejects(
    requestPaseoResend(
      f.message,
      "channel",
      actor,
      f.isCurrentIdentity,
      f.deps,
    ),
    /offline/,
  );
  assert.equal(getResendReceipt(f.key).phase, "pending");
  assert.match(getResendReceipt(f.key).error, /offline/);
  await requestPaseoResend(
    f.message,
    "channel",
    actor,
    f.isCurrentIdentity,
    f.deps,
  );
  assert.equal(f.signed.length, 1);
  assert.equal(f.published[0], f.published[1]);
  assert.equal(getResendReceipt(f.key).phase, "pending");
});
test("membership removed or identity/community switch prevents publishing", async () => {
  for (const scenario of ["member", "community", "identity", "other-message"]) {
    const f = setup();
    if (scenario === "member") f.deps.members = async () => [{ pubkey: actor }];
    if (scenario === "community")
      f.deps.details = async () => {
        f.switchCommunity();
        return { isMember: true };
      };
    if (scenario === "identity")
      f.deps.sign = async (input) => ({ ...input, pubkey: "b".repeat(64) });
    if (scenario === "other-message") f.message.pubkey = "b".repeat(64);
    await assert.rejects(
      requestPaseoResend(
        f.message,
        "channel",
        actor,
        f.isCurrentIdentity,
        f.deps,
      ),
    );
    assert.equal(f.published.length, 0, scenario);
  }
});
test("acknowledgement wins over late transport failure and newer edit is a separate request", async () => {
  const f = setup();
  f.deps.publish = async (event) => {
    setResendReceipt(f.key, { event, phase: "sent" });
    throw new Error("late socket close");
  };
  await assert.rejects(
    requestPaseoResend(
      f.message,
      "channel",
      actor,
      f.isCurrentIdentity,
      f.deps,
    ),
  );
  assert.equal(getResendReceipt(f.key).phase, "sent");
  f.deps.publish = async (event) => {
    f.published.push(event);
  };
  const newer = { ...f.message, editEventId: "f".repeat(64) };
  await requestPaseoResend(
    newer,
    "channel",
    actor,
    f.isCurrentIdentity,
    f.deps,
  );
  assert.equal(f.published.length, 1);
  assert.equal(
    getResendReceipt(
      receiptKey("one", actor, "channel", newer.id, newer.editEventId),
    ).phase,
    "pending",
  );
});

test("cached retry cannot publish after account switch during membership read", async () => {
  const f = setup();
  f.deps.publish = async (event) => {
    f.published.push(event);
    throw new Error("first failed");
  };
  await assert.rejects(
    requestPaseoResend(
      f.message,
      "channel",
      actor,
      f.isCurrentIdentity,
      f.deps,
    ),
  );
  const cached = getResendReceipt(f.key).event;
  f.deps.members = async () => {
    f.switchIdentity();
    return [{ pubkey: actor }, { pubkey: PASEO_PUBKEY }];
  };
  await assert.rejects(
    requestPaseoResend(
      f.message,
      "channel",
      actor,
      f.isCurrentIdentity,
      f.deps,
    ),
    /changed/,
  );
  assert.equal(f.published.length, 1);
  assert.equal(getResendReceipt(f.key).event, cached);
  assert.equal(f.signed.length, 1);
});
test("publisher's ownership callback includes the live identity fence", async () => {
  const f = setup();
  f.deps.publish = async (_event, _timeout, _error, isCurrent) => {
    assert.equal(isCurrent(), true);
    f.switchIdentity();
    assert.equal(isCurrent(), false);
  };
  await requestPaseoResend(
    f.message,
    "channel",
    actor,
    f.isCurrentIdentity,
    f.deps,
  );
});

test("the exact named revision is captured at activation before asynchronous membership", async () => {
  const f = setup();
  const captured = f.message.editEventId;
  f.deps.members = async () => {
    f.message.editEventId = "e".repeat(64);
    return [{ pubkey: actor }, { pubkey: PASEO_PUBKEY }];
  };
  await requestPaseoResend(
    f.message,
    "channel",
    actor,
    f.isCurrentIdentity,
    f.deps,
  );
  assert.deepEqual(
    f.published[0].tags.find((t) => t[0] === "edit"),
    ["edit", captured],
  );
});

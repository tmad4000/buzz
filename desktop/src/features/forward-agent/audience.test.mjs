import assert from "node:assert/strict";
import test from "node:test";
import {
  audienceKey,
  audienceDescription,
  needsAudienceConfirmation,
  readForwardAudiences,
} from "./audience.ts";
const lane = (id, members, visibility = "private") => ({
  channel: {
    id,
    name: id,
    channelType: id === "dm" ? "dm" : "stream",
    visibility,
    isMember: true,
    memberCount: members.length,
    memberPubkeys: members,
    archivedAt: null,
  },
  members: members.map((pubkey) => ({ pubkey, displayName: pubkey })),
});
test("same private audience can forward once; different, group and open audiences require consent", () => {
  const source = lane("dm", ["self", "agent"]);
  assert.equal(
    needsAudienceConfirmation({
      source,
      target: lane("p2", ["agent", "self"]),
    }),
    false,
  );
  for (const target of [
    lane("hermes", ["self", "hermes"]),
    lane("project", ["self", "agent", "third"]),
    lane("public", ["self", "agent"], "open"),
  ])
    assert.equal(needsAudienceConfirmation({ source, target }), true);
  assert.match(
    audienceDescription(lane("public", ["self", "agent"], "open")),
    /beyond the current member list/,
  );
});
test("confirmation identity binds member keys and target access policy, not counts alone", () => {
  const original = {
    source: lane("dm", ["self", "agent"]),
    target: lane("project", ["self", "agent", "alice"]),
  };
  assert.notEqual(
    audienceKey(original),
    audienceKey({
      ...original,
      target: lane("project", ["self", "agent", "bob"]),
    }),
  );
  assert.notEqual(
    audienceKey(original),
    audienceKey({
      ...original,
      target: lane("project", ["self", "agent", "alice"], "open"),
    }),
  );
});
test("fresh writer-side roster completeness and current membership are checked before consent", async () => {
  const calls = [];
  const source = lane("dm", ["self", "agent"]);
  const target = lane("target", ["self", "agent", "third"]);
  const io = {
    getChannelDetails: async (id, options) => {
      calls.push([id, options]);
      return id === "dm" ? source.channel : target.channel;
    },
    getChannelMembers: async (id, options) => {
      calls.push([id, options]);
      return id === "dm" ? source.members : target.members;
    },
  };
  const read = await readForwardAudiences(
    "dm",
    "target",
    "self",
    "https://relay.test",
    io,
  );
  assert.equal(read.target.members.length, 3);
  assert.equal(
    calls.every(([, o]) => o.readYourWrites === true),
    true,
  );
  await assert.rejects(
    readForwardAudiences("dm", "target", "self", "https://relay.test", {
      ...io,
      getChannelMembers: async () => [{ pubkey: "self" }, { pubkey: "self" }],
    }),
    /full current audience/,
  );
  await assert.rejects(
    readForwardAudiences("dm", "target", "self", "https://relay.test", {
      ...io,
      getChannelMembers: async (id) =>
        id === "dm"
          ? source.members
          : [{ pubkey: "other" }, { pubkey: "agent" }, { pubkey: "third" }],
    }),
    /full current audience/,
  );
});

test("writer roster alone determines membership; metadata count/key hints cannot bypass audience disclosure", async () => {
  const source = lane("dm", ["self", "agent"]),
    target = lane("target", ["self", "agent"]);
  const result = await readForwardAudiences(
    "dm",
    "target",
    "self",
    "https://relay.test",
    {
      getChannelDetails: async (id) =>
        id === "dm" ? source.channel : target.channel,
      getChannelMembers: async (id) =>
        id === "dm"
          ? source.members
          : [{ pubkey: "self" }, { pubkey: "other" }],
    },
  );
  assert.deepEqual(result.target.channel.memberPubkeys, ["self", "other"]);
  assert.equal(result.target.channel.memberCount, 2);
  assert.equal(needsAudienceConfirmation(result), true);
});

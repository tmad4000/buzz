import assert from "node:assert/strict";
import test from "node:test";

import {
  askContactAgentStatusText,
  possessiveName,
  resolveAskContactAgent,
  soleAskTarget,
} from "./askContactAgent.ts";

const VIEWER = "a".repeat(64);
const CONTACT = "b".repeat(64);
const STRANGER = "c".repeat(64);
const AGENT_1 = "1".repeat(64);
const AGENT_2 = "2".repeat(64);

function channel(id, overrides = {}) {
  return {
    id,
    name: id,
    channelType: "stream",
    visibility: "private",
    description: "",
    topic: null,
    purpose: null,
    memberCount: 3,
    memberPubkeys: [],
    lastMessageAt: null,
    archivedAt: null,
    participants: [],
    participantPubkeys: [],
    isMember: true,
    ttlSeconds: null,
    ttlDeadline: null,
    ...overrides,
  };
}

function agent(pubkey, overrides = {}) {
  return {
    pubkey,
    ownerPubkey: CONTACT,
    name: "Scout",
    agentType: "goose",
    channels: ["shared"],
    channelIds: ["shared"],
    capabilities: [],
    status: "online",
    respondTo: "anyone",
    respondToAllowlist: [],
    ...overrides,
  };
}

function resolve(relayAgents, channels = [channel("shared")], extra = {}) {
  return resolveAskContactAgent({
    contactPubkey: CONTACT,
    currentPubkey: VIEWER,
    relayAgents,
    channels,
    ...extra,
  });
}

test("one opted-in agent in one shared channel is the sole target", () => {
  const resolution = resolve([agent(AGENT_1)]);
  assert.equal(resolution.kind, "ready");
  const target = soleAskTarget(resolution);
  assert.equal(target?.agent.pubkey, AGENT_1);
  assert.equal(target?.place.channelId, "shared");
});

test("several agents are never guessed", () => {
  const resolution = resolve([
    agent(AGENT_1, { name: "Scout" }),
    agent(AGENT_2, { name: "Booker" }),
  ]);
  assert.equal(resolution.kind, "ready");
  assert.deepEqual(
    resolution.candidates.map((c) => c.name),
    ["Booker", "Scout"],
  );
  assert.equal(soleAskTarget(resolution), null);
});

test("one agent in several shared channels needs a choice, smallest audience first", () => {
  const resolution = resolve(
    [agent(AGENT_1, { channelIds: ["big", "small"] })],
    [channel("big", { memberCount: 40 }), channel("small", { memberCount: 2 })],
  );
  assert.equal(soleAskTarget(resolution), null);
  assert.deepEqual(
    resolution.candidates[0].places.map((p) => p.channelId),
    ["small", "big"],
  );
});

test("ownership must be the verified owner, not a name", () => {
  assert.deepEqual(
    resolve([agent(AGENT_1, { ownerPubkey: null, name: "Contact's agent" })]),
    { kind: "none" },
  );
  assert.deepEqual(resolve([agent(AGENT_1, { ownerPubkey: STRANGER })]), {
    kind: "none",
  });
});

test("owner-only and allowlists that exclude the viewer are not opted in", () => {
  assert.deepEqual(resolve([agent(AGENT_1, { respondTo: "owner-only" })]), {
    kind: "not-shared",
    agentCount: 1,
  });
  assert.deepEqual(
    resolve([
      agent(AGENT_1, {
        respondTo: "allowlist",
        respondToAllowlist: [STRANGER],
      }),
    ]),
    { kind: "not-shared", agentCount: 1 },
  );
  assert.equal(
    resolve([
      agent(AGENT_1, {
        respondTo: "allowlist",
        respondToAllowlist: [VIEWER.toUpperCase()],
      }),
    ]).kind,
    "ready",
  );
});

test("only live stream channels the viewer belongs to count", () => {
  for (const blocked of [
    channel("shared", { isMember: false }),
    channel("shared", { archivedAt: "2026-11-01T00:00:00Z" }),
    channel("shared", { channelType: "dm" }),
    // Forum mentions happen inside a post; there is no channel composer.
    channel("shared", { channelType: "forum" }),
  ]) {
    assert.equal(resolve([agent(AGENT_1)], [blocked]).kind, "not-shared");
  }
});

test("an agent outside every shared channel is not offered", () => {
  assert.equal(
    resolve([agent(AGENT_1, { channelIds: ["elsewhere"] })]).kind,
    "not-shared",
  );
});

test("offline agents are still offered, with their status", () => {
  const resolution = resolve([agent(AGENT_1, { status: "offline" })]);
  assert.equal(resolution.candidates[0].status, "offline");
});

test("loading, directory failure and self are explicit states", () => {
  assert.deepEqual(resolve(undefined), { kind: "loading" });
  assert.deepEqual(resolve([agent(AGENT_1)], [], { channels: undefined }), {
    kind: "loading",
  });
  assert.deepEqual(resolve([], [], { relayAgentsError: new Error("x") }), {
    kind: "unavailable",
    reason: "directory-error",
  });
  assert.deepEqual(
    resolve([agent(AGENT_1)], [channel("shared")], { currentPubkey: CONTACT }),
    { kind: "none" },
  );
});

test("duplicate directory rows collapse to one candidate", () => {
  const resolution = resolve([agent(AGENT_1), agent(AGENT_1.toUpperCase())]);
  assert.equal(resolution.candidates.length, 1);
});

test("copy names the owner possessively and explains opt-in", () => {
  assert.equal(possessiveName("Tyler"), "Tyler's");
  assert.equal(possessiveName("James"), "James'");
  assert.equal(
    askContactAgentStatusText({ kind: "not-shared", agentCount: 1 }, "Tyler"),
    "Tyler's agent hasn't opted in to answer you in a channel you share.",
  );
  assert.equal(askContactAgentStatusText({ kind: "none" }, "Tyler"), null);
});

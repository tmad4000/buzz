// Real-relay round trip for "Ask <contact>'s agent" (buzz-lanes-8pn.1).
//
// Controlled identities only: the seeded test users alice (asker) and tyler
// (contact/owner), plus a deterministic test bot that tyler attests with
// NIP-OA. Everything runs against an ISOLATED local relay started by
// scripts/run-ask-agent-roundtrip.sh; nothing touches a hosted relay.
//
// Run:  node --import ./test-loader.mjs --experimental-strip-types \
//         tests/roundtrip/ask-contact-agent.roundtrip.mjs
// Env:  BUZZ_ROUNDTRIP_RELAY_URL (required), BUZZ_ROUNDTRIP_OUT (optional JSON)
//
// It proves, on the wire:
//  1. discovery: alice finds tyler's opted-in agent from tyler's identity via
//     the same coordinates the desktop directory reads (39002 membership,
//     kind-0 NIP-OA profile, owner-signed kind-30177 policy), resolved by the
//     shipped resolver; an owner-only sibling agent is not offered;
//  2. ask: alice publishes one explicit kind-9 question p-tagging the agent;
//  3. reply: the bot answers in that question's thread, signed by its own key
//     with a valid NIP-OA tag naming tyler ("agent of tyler, not tyler");
//  4. duplicate send: republishing the identical signed question yields no
//     second stored event and no second reply;
//  5. unavailable: a question to a stopped agent gets no reply within the
//     window, and is reported, not silently dropped.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";

import {
  resolveAskContactAgent,
  soleAskTarget,
} from "../../src/features/agents/lib/askContactAgent.ts";

const require = createRequire(import.meta.url);
const { schnorr } = await import(
  require.resolve("@noble/curves/secp256k1.js", {
    paths: [require.resolve("nostr-tools")],
  })
);

const RELAY = process.env.BUZZ_ROUNDTRIP_RELAY_URL;
if (!RELAY) throw new Error("BUZZ_ROUNDTRIP_RELAY_URL is required");

const hex = (bytes) => Buffer.from(bytes).toString("hex");
const fromHex = (value) => Uint8Array.from(Buffer.from(value, "hex"));
const sha256 = (text) => createHash("sha256").update(text).digest();
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Seeded desktop test identities (tests/helpers/bridge.ts TEST_IDENTITIES).
const ALICE_SK =
  "3fa69cbac1dcb9b7b6ac83117c74bd23bb1e717fe8fc7cfda67b47bb4323383d";
const TYLER_SK =
  "3dbaebadb5dfd777ff25149ee230d907a15a9e1294b40b830661e65bb42f6c03";
// Deterministic synthetic agents, owned by tyler.
const SCOUT_SK = hex(sha256("buzz-lanes-8pn.1 roundtrip agent scout"));
const QUIET_SK = hex(sha256("buzz-lanes-8pn.1 roundtrip agent quiet"));
const PRIVATE_SK = hex(sha256("buzz-lanes-8pn.1 roundtrip agent private"));
// A mimic claims tyler as owner, but its NIP-OA tag is signed by another key.
const MIMIC_SK = hex(sha256("buzz-lanes-8pn.1 roundtrip agent mimic"));
const FORGER_SK = hex(sha256("buzz-lanes-8pn.1 roundtrip forger"));

const who = (sk) => getPublicKey(fromHex(sk));
const ALICE = who(ALICE_SK);
const TYLER = who(TYLER_SK);
const SCOUT = who(SCOUT_SK);
const QUIET = who(QUIET_SK);
const PRIVATE = who(PRIVATE_SK);
const MIMIC = who(MIMIC_SK);

function sign(sk, kind, content, tags, createdAt = now()) {
  return finalizeEvent(
    { kind, content, tags, created_at: createdAt },
    fromHex(sk),
  );
}

async function post(event) {
  const response = await fetch(`${RELAY}/events`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pubkey": event.pubkey },
    body: JSON.stringify(event),
  });
  const text = await response.text();
  return { status: response.status, body: text };
}

async function mustPost(event, label) {
  const result = await post(event);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${label}: relay refused (${result.status}) ${result.body}`,
  );
  return result;
}

async function query(viewer, filters) {
  const response = await fetch(`${RELAY}/query`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-pubkey": viewer },
    body: JSON.stringify(filters),
  });
  const text = await response.text();
  assert.equal(response.status, 200, `query failed: ${text}`);
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : (parsed.events ?? []);
}

// NIP-OA: owner signs sha256("nostr:agent-auth:" || agent || ":" || conditions)
function authTag(ownerSk, agentPubkey, conditions = "") {
  const digest = sha256(`nostr:agent-auth:${agentPubkey}:${conditions}`);
  return [
    "auth",
    who(ownerSk),
    conditions,
    hex(schnorr.sign(digest, fromHex(ownerSk))),
  ];
}

function verifiedOwner(event) {
  if (!verifyEvent(event)) return null;
  const tags = event.tags.filter((tag) => tag[0] === "auth");
  if (tags.length !== 1 || tags[0].length !== 4) return null;
  const [, owner, conditions, sig] = tags[0];
  if (conditions !== "" || owner === event.pubkey) return null;
  const digest = sha256(`nostr:agent-auth:${event.pubkey}:${conditions}`);
  return schnorr.verify(fromHex(sig), digest, fromHex(owner)) ? owner : null;
}

const evidence = { relay: RELAY, steps: [] };
const step = (name, data) => {
  evidence.steps.push({ name, ...data });
  console.log(`✔ ${name}`, JSON.stringify(data));
};

// ── Fixture: a fresh channel tyler creates; alice and the agents join ───────
const channelId = randomUUID();
const channelName = `ask-agent-rt-${channelId.slice(0, 8)}`;
await mustPost(
  sign(TYLER_SK, 9007, "", [
    ["h", channelId],
    ["name", channelName],
    ["visibility", "private"],
    ["channel_type", "stream"],
  ]),
  "create channel",
);
for (const [pubkey, role] of [
  [ALICE, null],
  [SCOUT, "bot"],
  [QUIET, "bot"],
  [PRIVATE, "bot"],
  [MIMIC, "bot"],
]) {
  await mustPost(
    sign(TYLER_SK, 9000, "", [
      ["h", channelId],
      ["p", pubkey],
      ...(role ? [["role", role]] : []),
    ]),
    `add member ${pubkey.slice(0, 8)}`,
  );
}
for (const [sk, name, respondTo] of [
  [SCOUT_SK, "Scout", "anyone"],
  [QUIET_SK, "Quiet", "anyone"],
  [PRIVATE_SK, "Ledger", "owner-only"],
]) {
  const agent = who(sk);
  await mustPost(
    sign(sk, 0, JSON.stringify({ name, display_name: name }), [
      authTag(TYLER_SK, agent),
    ]),
    `${name} profile`,
  );
  await mustPost(
    sign(TYLER_SK, 30177, JSON.stringify({ name, respond_to: respondTo }), [
      ["d", agent],
    ]),
    `${name} policy`,
  );
}
{
  // Forged: owner field says tyler, signature is the forger's.
  const [, , conditions, forgedSig] = authTag(FORGER_SK, MIMIC);
  await mustPost(
    sign(MIMIC_SK, 0, JSON.stringify({ name: "Tyler's agent" }), [
      ["auth", TYLER, conditions, forgedSig],
    ]),
    "mimic profile",
  );
  await mustPost(
    sign(
      FORGER_SK,
      30177,
      JSON.stringify({ name: "Tyler's agent", respond_to: "anyone" }),
      [["d", MIMIC]],
    ),
    "mimic policy (forger-signed)",
  );
}
await mustPost(
  sign(
    TYLER_SK,
    0,
    JSON.stringify({ name: "tyler", display_name: "Tyler" }),
    [],
  ),
  "tyler profile",
);
step("fixture", { channelId, channelName, alice: ALICE, tyler: TYLER });

// ── 1. Discovery from tyler's identity, as alice ─────────────────────────────
const relayInfo = await (
  await fetch(`${RELAY}/`, { headers: { accept: "application/nostr+json" } })
).json();
const relayPubkey = relayInfo.self;
assert.match(relayPubkey ?? "", /^[0-9a-f]{64}$/, "relay self pubkey");

let membership = [];
for (let attempt = 0; attempt < 50; attempt++) {
  membership = await query(ALICE, [
    {
      kinds: [39002],
      authors: [relayPubkey],
      "#p": [ALICE],
      "#d": [channelId],
    },
  ]);
  if (
    membership.some((event) =>
      event.tags.some((tag) => tag[0] === "p" && tag[1] === SCOUT),
    )
  )
    break;
  await sleep(100);
}
const memberEvent = membership.find((event) =>
  event.tags.some((tag) => tag[0] === "d" && tag[1] === channelId),
);
assert.ok(memberEvent && verifyEvent(memberEvent), "relay-signed membership");
const botMembers = memberEvent.tags
  .filter((tag) => tag[0] === "p" && tag[3] === "bot")
  .map((tag) => tag[1]);
const profiles = await query(ALICE, [{ kinds: [0], authors: botMembers }]);
const owners = new Map(
  profiles.flatMap((profile) => {
    const owner = verifiedOwner(profile);
    return owner ? [[profile.pubkey, owner]] : [];
  }),
);
const policies = (
  await query(
    ALICE,
    [...owners].map(([agent, owner]) => ({
      kinds: [30177],
      authors: [owner],
      "#d": [agent],
      limit: 1,
    })),
  )
).filter(verifyEvent);
const relayAgents = policies.map((policy) => {
  const agent = policy.tags.find((tag) => tag[0] === "d")[1];
  const body = JSON.parse(policy.content);
  return {
    pubkey: agent,
    ownerPubkey: owners.get(agent),
    name: body.name,
    agentType: "roundtrip",
    channels: [channelName],
    channelIds: [channelId],
    capabilities: [],
    status: agent === QUIET ? "offline" : "online",
    respondTo: body.respond_to,
    respondToAllowlist: body.respond_to_allowlist ?? [],
  };
});
const channels = [
  {
    id: channelId,
    name: channelName,
    channelType: "stream",
    visibility: "private",
    memberCount: memberEvent.tags.filter((tag) => tag[0] === "p").length,
    archivedAt: null,
    isMember: true,
  },
];
const resolution = resolveAskContactAgent({
  contactPubkey: TYLER,
  currentPubkey: ALICE,
  relayAgents,
  channels,
});
assert.equal(resolution.kind, "ready");
const offered = resolution.candidates.map((candidate) => candidate.name);
assert.deepEqual(
  offered,
  ["Quiet", "Scout"],
  "owner-only Ledger and forged-owner mimic excluded",
);
assert.equal(owners.has(MIMIC), false, "forged NIP-OA tag rejected");
assert.equal(soleAskTarget(resolution), null, "two agents: user must choose");
const scout = resolution.candidates.find((c) => c.pubkey === SCOUT);
step("discovery", {
  offered,
  excluded: ["Ledger (owner-only)", "Tyler's agent (forged NIP-OA)"],
  ownerVerifiedByNipOa: owners.get(SCOUT) === TYLER,
  place: scout.places[0],
});

// ── The controlled bot: answers only explicit, policy-admitted mentions ──────
const answered = new Map();
let botRunning = true;
async function runBot() {
  const since = now() - 5;
  while (botRunning) {
    const asks = await query(SCOUT, [
      { kinds: [9], "#h": [channelId], "#p": [SCOUT], since },
    ]);
    for (const ask of asks) {
      if (answered.has(ask.id) || !verifyEvent(ask)) continue;
      if (ask.pubkey === SCOUT) continue;
      // Policy is "anyone" in a channel both are members of (checked above by
      // the relay's membership); a production harness re-checks its policy.
      const reply = sign(
        SCOUT_SK,
        9,
        "Launch review is Thursday 10:00 (synthetic fixture answer).",
        [
          ["h", channelId],
          ["e", ask.id, "", "reply"],
          ["p", ask.pubkey],
          authTag(TYLER_SK, SCOUT),
        ],
      );
      answered.set(ask.id, reply.id);
      await mustPost(reply, "bot reply");
    }
    await sleep(200);
  }
}
const bot = runBot();

// ── 2. Ask, explicitly ───────────────────────────────────────────────────────
const question = sign(ALICE_SK, 9, "@Scout when is the launch review?", [
  ["h", channelId],
  ["p", SCOUT],
]);
const first = await mustPost(question, "question");
step("ask", { questionId: question.id, relay: first.status });

// ── 3. Same-thread, attributed, authenticated reply ──────────────────────────
let replies = [];
for (let attempt = 0; attempt < 75 && replies.length === 0; attempt++) {
  await sleep(200);
  replies = await query(ALICE, [
    { kinds: [9], "#h": [channelId], "#e": [question.id] },
  ]);
}
assert.equal(replies.length, 1, "exactly one reply");
const [reply] = replies;
assert.ok(verifyEvent(reply), "reply signature valid");
assert.equal(reply.pubkey, SCOUT, "author is the agent key, not the owner");
assert.equal(verifiedOwner(reply), TYLER, "NIP-OA names tyler as owner");
assert.ok(
  reply.tags.some((tag) => tag[0] === "e" && tag[1] === question.id),
  "reply is in the question's thread",
);
step("reply", {
  replyId: reply.id,
  author: reply.pubkey,
  authorizedBy: TYLER,
  sameThread: true,
  content: reply.content,
});

// ── 4. Duplicate send: the outbox retries the exact same signed event (see
// outbox/engine.ts); here the relay deduplicates that identical event. ─────
const again = await post(question);
await sleep(1500);
const stored = await query(ALICE, [{ ids: [question.id] }]);
const repliesAfter = await query(ALICE, [
  { kinds: [9], "#h": [channelId], "#e": [question.id] },
]);
assert.equal(stored.length, 1, "one stored question");
assert.equal(repliesAfter.length, 1, "still one reply");
step("duplicate", {
  resendStatus: again.status,
  resendBody: again.body.slice(0, 160),
  storedQuestions: stored.length,
  replies: repliesAfter.length,
});

// ── 5. Unavailable recipient: Quiet has no running bot ───────────────────────
botRunning = false;
await bot;
const toQuiet = sign(ALICE_SK, 9, "@Quiet are you there?", [
  ["h", channelId],
  ["p", QUIET],
]);
await mustPost(toQuiet, "question to unavailable agent");
await sleep(3000);
const quietReplies = await query(ALICE, [
  { kinds: [9], "#h": [channelId], "#e": [toQuiet.id] },
]);
const quietStored = await query(ALICE, [{ ids: [toQuiet.id] }]);
assert.equal(quietReplies.length, 0);
assert.equal(quietStored.length, 1, "question persisted, not dropped");
step("unavailable", {
  questionId: toQuiet.id,
  stored: true,
  replies: 0,
  shownAs: "offline (directory status); question remains in channel",
});

if (process.env.BUZZ_ROUNDTRIP_OUT) {
  writeFileSync(
    process.env.BUZZ_ROUNDTRIP_OUT,
    JSON.stringify(evidence, null, 2),
  );
}
console.log("ROUNDTRIP PASS");

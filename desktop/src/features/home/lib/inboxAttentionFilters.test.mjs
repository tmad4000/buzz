import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent } from "nostr-tools/pure";
import { BRIDGE_STATUS_SIGNER } from "../../messages/lib/bridgeStatusCard.ts";
import {
  buildInboxAttentionFilters,
  formatInboxAttentionCount,
} from "./inboxAttentionFilters.ts";
import { buildInboxItems } from "./inbox.ts";
import {
  collectInboxStatusCandidates,
  projectInboxStatusCards,
  toInboxActivityEvent,
} from "./inboxStatusCards.ts";
import { discoverInboxActivity } from "./inboxStatusDiscovery.ts";

const OWNER = "1".repeat(64);
const OTHER = "2".repeat(64);
const ORIGIN = "a".repeat(64);
const CARD = "b".repeat(64);
const EDIT = "c".repeat(64);
const CHANNEL = "11111111-1111-4111-8111-111111111111";
const OUTSIDE = "22222222-2222-4222-8222-222222222222";
const SERVER = "srv_fixture";
const AGENT = "33333333-3333-4333-8333-333333333333";
const snapshot = (state, source = "root") => [
  ["buzz-status", state],
  ["agent", AGENT, SERVER, "Synthetic agent"],
  ["paseo-link", `paseo://h/${SERVER}/agent/${AGENT}`],
  ["buzz-status-source", source],
];
const event = (details) => ({
  id: ORIGIN,
  pubkey: OWNER,
  kind: 9,
  created_at: 10,
  content: "Synthetic fixture",
  tags: [["h", CHANNEL]],
  sig: "",
  ...details,
});
const origin = event({});
const card = (state, source) =>
  event({
    id: CARD,
    pubkey: BRIDGE_STATUS_SIGNER,
    created_at: 11,
    tags: [
      ["h", CHANNEL],
      ["e", ORIGIN, "", "reply"],
      ...snapshot(state, source),
    ],
  });
const edit = (state, overrides) =>
  event({
    id: EDIT,
    pubkey: BRIDGE_STATUS_SIGNER,
    kind: 40003,
    created_at: 12,
    tags: [["h", CHANNEL], ["e", CARD], ...snapshot(state)],
    ...overrides,
  });
const project = (original, edits = [], origins = [origin]) => {
  const { cards } = collectInboxStatusCandidates([
    toInboxActivityEvent(original),
  ]);
  return projectInboxStatusCards(cards, edits, origins, OWNER);
};

test("only a root report from the bridge with a same-channel origin by the signed-in user qualifies", () => {
  assert.equal(project(card("waiting")).get(CARD)?.state, "waiting");
  assert.equal(project(card("waiting", "watchdog")).size, 0);
  assert.equal(project(card("done", "listener")).size, 0);
  assert.equal(project(card("ack")).size, 0);
  assert.equal(project({ ...card("done"), pubkey: OTHER }).size, 0);
  assert.equal(project(card("done"), [], []).size, 0);
  assert.equal(
    project(card("done"), [], [{ ...origin, pubkey: OTHER }]).size,
    0,
  );
  assert.equal(
    project(card("done"), [], [{ ...origin, tags: [["h", OUTSIDE]] }]).size,
    0,
  );
});

test("later revisions replace rather than merge status; forged, off-channel and deleted edits cannot take over", () => {
  assert.equal(
    project(card("waiting"), [edit("done")]).get(CARD)?.revisionId,
    EDIT,
  );
  assert.equal(
    project(card("waiting"), [edit("done", { pubkey: OTHER })]).get(CARD)
      ?.state,
    "waiting",
  );
  assert.equal(
    project(card("waiting"), [
      edit("done", {
        tags: [["h", OUTSIDE], ["e", CARD], ...snapshot("done")],
      }),
    ]).get(CARD)?.state,
    "waiting",
  );
  assert.equal(project(card("waiting"), [edit("ack")]).size, 0);
  const clearingEdit = edit("done", {
    tags: [
      ["h", CHANNEL],
      ["e", CARD],
    ],
    content: `❓ Needs Jacob — Synthetic agent · Model (Provider)\nAgent \`${AGENT}\` · server \`${SERVER}\`\n[Open agent](paseo://h/${SERVER}/agent/${AGENT})\nReported status · source: root`,
  });
  assert.equal(project(card("waiting"), [clearingEdit]).size, 0);
  const deletingEdit = event({
    pubkey: BRIDGE_STATUS_SIGNER,
    kind: 5,
    tags: [["e", EDIT]],
  });
  assert.equal(
    project(card("waiting"), [edit("done"), deletingEdit]).get(CARD)?.state,
    "waiting",
  );
});

test("the views combine explicit membership, merge linked due reminders, and reopen per exact done revision", () => {
  const needsAction = toInboxActivityEvent(
    event({ id: "5".repeat(64), kind: 46010 }),
  );
  const result = buildInboxItems({
    feed: {
      feed: {
        mentions: [],
        needsAction: [needsAction],
        activity: [toInboxActivityEvent(card("done"))],
        agentActivity: [],
      },
    },
  });
  const due = {
    id: "due",
    createdAt: 1,
    notBefore: 2,
    content: { status: "pending", target: { eventId: needsAction.id } },
  };
  const options = {
    items: result,
    dueReminders: [due],
    snapshots: project(card("waiting"), [edit("done")]),
    effectiveDoneSet: new Set([CARD, needsAction.id]),
    unreadOnly: true,
    selectedConversationId: null,
    getChannelReadAt: () => null,
    getMessageReadAt: () => null,
  };
  const initial = buildInboxAttentionFilters(options);
  assert.deepEqual(
    initial.rowsByFilter.answers.map((row) => row.id),
    [CARD],
  );
  assert.deepEqual(
    initial.rowsByFilter.needs_you.map((row) => row.id),
    [needsAction.id],
  );
  assert.equal(initial.needsYouCount, 1);
  const confirmed = buildInboxAttentionFilters({
    ...options,
    getMessageReadAt: (id) => (id === EDIT ? 12 : null),
  });
  assert.equal(confirmed.rowsByFilter.answers.length, 0);
  assert.equal(formatInboxAttentionCount(0, false, "unavailable"), "0?");
  assert.equal(formatInboxAttentionCount(2, true, "syncing"), "2+…");
});

test("discovery batches within the channel scope and withholds signed off-scope and altered events", async () => {
  const signer = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
  const sign = (channel, content) =>
    finalizeEvent(
      {
        kind: 43004,
        created_at: 12,
        tags: [["h", channel]],
        content,
      },
      signer,
    );
  const valid = sign(CHANNEL, "Synthetic result");
  const tampered = { ...sign(CHANNEL, "Signed content"), content: "Altered" };
  const denied = sign(OUTSIDE, "Other channel");
  const requests = [];
  const channelIds = [
    CHANNEL,
    ...Array.from({ length: 100 }, (_, i) => `channel-${i}`),
  ];
  const result = await discoverInboxActivity({
    channelIds,
    currentPubkey: OWNER,
    limit: 50,
    fetchEvents: async (filter) => {
      requests.push(filter);
      return filter.kinds[0] === 43004 && filter["#h"].includes(CHANNEL)
        ? [valid, tampered, denied]
        : [];
    },
    fetchStructural: async (ids) => {
      assert.deepEqual(ids, []);
      return [];
    },
  });
  assert.deepEqual(
    result.activity.map(({ id }) => id),
    [valid.id],
  );
  assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.ok(request["#h"].length <= 100);
    assert.ok(request["#h"].every((id) => channelIds.includes(id)));
    assert.equal(request.limit, 50);
    if (request.kinds[0] === 9)
      assert.deepEqual(request.authors, [BRIDGE_STATUS_SIGNER]);
  }
});

test("denied relay discovery is an error and never appears as a confirmed empty view", async () => {
  await assert.rejects(
    discoverInboxActivity({
      channelIds: [CHANNEL],
      currentPubkey: OWNER,
      limit: 50,
      fetchEvents: async () => {
        throw new Error("restricted: channel access");
      },
      fetchStructural: async () => {
        assert.fail("must not start an aux read");
      },
    }),
    /restricted: channel access/,
  );
});

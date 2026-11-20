import assert from "node:assert/strict";
import { test } from "node:test";
import { BRIDGE_STATUS_SIGNER } from "../messages/lib/bridgeStatusCard.ts";
import { collectResultCards, parseResultCard } from "./resultCards.ts";

const channel = "f131f292-2565-4d48-9dbd-7dfad754ad6f";
const root = "a".repeat(64);
const parent = "b".repeat(64);
const agent = "83af8669-54dc-472a-a817-c73925b0d55c";
const server = "srv_testnode";
const result = [
  "buzz-result",
  "1",
  "channel-page",
  "result-brief",
  "Brief",
  "Early findings",
];
const message = {
  id: "c".repeat(64),
  kind: 9,
  createdAt: 300,
  signerPubkey: BRIDGE_STATUS_SIGNER,
  body: "Reported status",
  tags: [
    ["h", channel],
    ["e", root, "", "root"],
    ["e", parent, "", "reply"],
    ["agent", agent, server, "Research agent"],
    ["paseo-link", `paseo://h/${server}/agent/${agent}`],
    ["buzz-status", "done"],
    ["buzz-status-source", "root"],
    result,
  ],
};

test("projects a signed result with the thread root and in-channel Page section", () => {
  assert.deepEqual(parseResultCard(message, channel), {
    messageId: message.id,
    rootId: root,
    parentId: parent,
    channelId: channel,
    createdAt: 300,
    title: "Brief",
    summary: "Early findings",
    agent: "Research agent",
    agentId: agent,
    serverId: server,
    sectionId: "result-brief",
  });
});

test("ignores unsigned, cross-channel, ambiguous and malformed result links", () => {
  const withoutResult = message.tags.slice(0, -1);
  for (const candidate of [
    { ...message, signerPubkey: "d".repeat(64) },
    { ...message, edited: true },
    { ...message, edited: true, editSignerPubkey: "d".repeat(64) },
    { ...message, pending: true },
    { ...message, tags: [...message.tags, result] },
    { ...message, tags: [...message.tags, ["h", "another-channel"]] },
    { ...message, tags: [...message.tags, ["e", "d".repeat(64), "", "root"]] },
    {
      ...message,
      tags: [
        ...withoutResult,
        [...result.slice(0, 3), "https://example.test", "Title", "Summary"],
      ],
    },
    {
      ...message,
      tags: [...withoutResult, [...result.slice(0, 5), "a".repeat(481)]],
    },
    {
      ...message,
      tags: [...withoutResult, [...result.slice(0, 5), "x\u2066y"]],
    },
    {
      ...message,
      tags: message.tags.filter(([name]) => name !== "buzz-status"),
    },
  ]) {
    assert.equal(parseResultCard(candidate, channel), null);
  }
  assert.equal(parseResultCard(message, "another-channel"), null);
});

test("requires Root done and the agreed full slug and Unicode grammar", () => {
  const resultAt = (offset, value) => {
    const tag = [...result];
    tag[offset] = value;
    return { ...message, tags: [...message.tags.slice(0, -1), tag] };
  };
  for (const candidate of [
    resultAt(3, "result-brief\n"),
    resultAt(3, `result-${"a".repeat(81)}`),
    resultAt(4, "\u0378"),
    resultAt(4, "\ue000"),
    resultAt(5, "a\u00a0b"),
    resultAt(5, "A\u2028B"),
    {
      ...message,
      tags: message.tags.map((tag) =>
        tag[0] === "buzz-status" ? ["buzz-status", "progress"] : tag,
      ),
    },
  ]) {
    assert.equal(parseResultCard(candidate, channel), null);
  }
  const bounded = resultAt(4, "🔍".repeat(160));
  assert.equal(parseResultCard(bounded, channel).title, "🔍".repeat(160));
});

test("projection deduplicates sections and sorts by newest without mutating the source", () => {
  const current = { ...message, id: "e".repeat(64), createdAt: 500 };
  const second = {
    ...message,
    id: "f".repeat(64),
    createdAt: 400,
    tags: [
      ...message.tags.slice(0, -1),
      ["buzz-result", "1", "channel-page", "result-second", "Title", "Summary"],
    ],
  };
  const messages = [message, current, second];
  assert.deepEqual(
    collectResultCards(messages, channel).map((card) => card.messageId),
    [current.id, second.id],
  );
  assert.equal(messages[0], message);
});

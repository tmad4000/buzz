import { BUZZ_RESULT_TAG } from "@/features/messages/lib/bridgeResultTags";
import {
  parseBridgeStatusCard,
  producerExcludes,
} from "@/features/messages/lib/bridgeStatusCard";
import { getThreadReference } from "@/features/messages/lib/threading";
import type { TimelineMessage } from "@/features/messages/types";

export type ResultCard = {
  messageId: string;
  rootId: string;
  parentId: string;
  channelId: string;
  createdAt: number;
  title: string;
  summary: string;
  agent: string;
  agentId: string;
  serverId: string;
  sectionId: string;
};

const SECTION_ID = /^result-[a-z0-9][a-z0-9-]{0,79}(?![\s\S])/;
const EVENT_ID = /^[0-9a-f]{64}(?![\s\S])/;
const NON_ASCII_WHITESPACE =
  /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;

function isDisplayText(value: unknown, limit: number) {
  return (
    typeof value === "string" &&
    value.length <= limit * 2 &&
    value.length > 0 &&
    !value.startsWith(" ") &&
    !value.endsWith(" ") &&
    !NON_ASCII_WHITESPACE.test(value) &&
    Array.from(value).length <= limit &&
    !Array.from(value).some(producerExcludes)
  );
}

/** Parse a published section on a signed, Root-reported bridge status card. */
export function parseResultCard(
  message: TimelineMessage,
  channelId: string,
): ResultCard | null {
  const tags = message.tags ?? [];
  const resultTags = tags.filter(([name]) => name === BUZZ_RESULT_TAG);
  if (
    resultTags.length !== 1 ||
    message.pending ||
    !EVENT_ID.test(message.id) ||
    !Number.isSafeInteger(message.createdAt) ||
    message.createdAt < 0 ||
    message.createdAt > 8.64e12
  ) {
    return null;
  }

  const result = resultTags[0];
  const [, version, location, sectionId, title, summary] = result;
  if (
    result.length !== 6 ||
    version !== "1" ||
    location !== "channel-page" ||
    typeof sectionId !== "string" ||
    !SECTION_ID.test(sectionId) ||
    !isDisplayText(title, 160) ||
    !isDisplayText(summary, 480)
  ) {
    return null;
  }

  const channelTags = tags.filter(([name]) => name === "h");
  const roots = tags.filter(
    ([name, , , marker]) => name === "e" && marker === "root",
  );
  if (
    channelTags.length !== 1 ||
    channelTags[0][1] !== channelId ||
    roots.length > 1
  ) {
    return null;
  }

  const { rootId } = getThreadReference(tags);
  if (!rootId || !EVENT_ID.test(rootId)) return null;

  const card = parseBridgeStatusCard(message);
  const status = tags.find(([name]) => name === "buzz-status")?.[1];
  if (
    !card ||
    !("originEventId" in card) ||
    !card.originEventId ||
    card.source !== "root" ||
    status !== "done" ||
    !EVENT_ID.test(card.originEventId)
  ) {
    return null;
  }
  return {
    messageId: message.id,
    rootId,
    parentId: card.originEventId,
    channelId,
    createdAt: message.createdAt,
    title,
    summary,
    agent: card.title,
    agentId: card.agentId,
    serverId: card.serverId,
    sectionId,
  };
}

/** Project one current card per loaded result and order newest first. */
export function collectResultCards(
  messages: readonly TimelineMessage[],
  channelId: string,
): ResultCard[] {
  const bySection = new Map<string, ResultCard>();
  for (const message of messages) {
    const card = parseResultCard(message, channelId);
    if (!card) continue;
    const existing = bySection.get(card.sectionId);
    if (!existing || compareCards(card, existing) < 0) {
      bySection.set(card.sectionId, card);
    }
  }
  return [...bySection.values()].sort(compareCards);
}

function compareCards(a: ResultCard, b: ResultCard) {
  return b.createdAt - a.createdAt || a.messageId.localeCompare(b.messageId);
}

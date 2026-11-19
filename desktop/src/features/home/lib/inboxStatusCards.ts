import { verifyEvent } from "nostr-tools/pure";
import {
  type InboxItem,
  relayEventFromFeedItem,
} from "@/features/home/lib/inbox";
import {
  BRIDGE_STATUS_SIGNER,
  parseBridgeStatusCard,
} from "@/features/messages/lib/bridgeStatusCard";
import { formatTimelineMessages } from "@/features/messages/lib/formatTimelineMessages";
import {
  getChannelIdFromTags,
  getThreadReference,
} from "@/features/messages/lib/threading";
import type { FeedItem, RelayEvent } from "@/shared/api/types";
import {
  KIND_DELETION,
  KIND_NIP29_DELETE_EVENT,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_EDIT,
} from "@/shared/constants/kinds";

/** Relay history is verified again before using author identity for Inbox attention. */
export function isVerifiedInboxRelayEvent(event: RelayEvent): boolean {
  try {
    const { id, kind, pubkey, tags, content, created_at, sig } = event;
    return verifyEvent({ id, kind, pubkey, tags, content, created_at, sig });
  } catch {
    return false;
  }
}

function statusOrigin(tags: string[][]) {
  return getThreadReference(tags).parentId;
}

/** Convert an authenticated relay event into the existing Inbox feed shape. */
export function toInboxActivityEvent(event: RelayEvent): FeedItem {
  return {
    id: event.id,
    kind: event.kind,
    pubkey: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
    channelId: getChannelIdFromTags(event.tags),
    channelName: "",
    tags: event.tags,
    category: "activity",
  };
}

/** Edits cannot introduce new card IDs. */
export function collectInboxStatusCandidates(items: readonly FeedItem[]) {
  const cards = new Map<string, FeedItem>();
  const originIds = new Set<string>();
  for (const event of items) {
    const origin = statusOrigin(event.tags);
    if (
      event.kind === KIND_STREAM_MESSAGE &&
      event.pubkey === BRIDGE_STATUS_SIGNER &&
      event.channelId &&
      origin &&
      /^[0-9a-f]{64}$/.test(origin)
    ) {
      cards.set(event.id, event);
      originIds.add(origin);
    }
  }
  return { cards, originIds: [...originIds].sort() };
}

export type InboxStatusCard = {
  state: "waiting" | "done";
  title: string;
  href: string;
  eventId: string;
  originEventId: string;
  revisionId: string;
  revisionAt: number;
  preview: string;
};

/** Project the same effective snapshots as the thread timeline. */
export function projectInboxStatusCards(
  cards: ReadonlyMap<string, FeedItem>,
  aux: RelayEvent[],
  origins: RelayEvent[],
  currentPubkey: string,
) {
  const originsById = new Map(origins.map((event) => [event.id, event]));
  // The formatter uses the raw signer on this path and ignores actor tags.
  const events = [...cards.values()].map(relayEventFromFeedItem);
  const edits = new Map<string, { event: RelayEvent; target: FeedItem }>();
  for (const event of aux) {
    if (
      event.kind !== KIND_STREAM_MESSAGE_EDIT ||
      event.pubkey !== BRIDGE_STATUS_SIGNER
    )
      continue;
    const refs = event.tags.filter(([name]) => name === "e");
    const target = refs.length === 1 ? cards.get(refs[0][1]) : undefined;
    const channel = getChannelIdFromTags(event.tags);
    if (
      target &&
      channel === target.channelId &&
      event.created_at >= target.createdAt
    ) {
      edits.set(event.id, { event, target });
    }
  }
  const deletions = aux.flatMap((event) => {
    if (event.kind !== KIND_DELETION && event.kind !== KIND_NIP29_DELETE_EVENT)
      return [];
    const tags = event.tags.filter(([key, id]) => {
      if (key !== "e") return true;
      const target = cards.get(id) ?? edits.get(id)?.target;
      return (
        target &&
        (event.kind === KIND_DELETION
          ? event.pubkey === BRIDGE_STATUS_SIGNER
          : getChannelIdFromTags(event.tags) === target.channelId)
      );
    });
    return [{ ...event, tags }];
  });
  const deleted = new Set(
    deletions.flatMap(({ tags }) =>
      tags.filter(([name]) => name === "e").map(([, id]) => id),
    ),
  );
  const taggedHistory = new Set(
    [...edits.values()]
      .filter(
        ({ event }) =>
          !deleted.has(event.id) &&
          event.tags.some(([name]) => name === "buzz-status"),
      )
      .map(({ target }) => target.id),
  );
  const authorizedAux = [...edits.values()]
    .map(({ event }) => event)
    .concat(deletions);
  const result = new Map<string, InboxStatusCard>();
  for (const message of formatTimelineMessages(
    [...events, ...authorizedAux],
    null,
    undefined,
    null,
  )) {
    const card = cards.get(message.id);
    if (
      message.edited &&
      (taggedHistory.has(message.id) ||
        card?.tags.some(([name]) => name === "buzz-status")) &&
      !message.tags?.some(([name]) => name === "buzz-status")
    )
      continue;
    const parsed = parseBridgeStatusCard(message);
    const revision = message.bodyRevision;
    if (!parsed || !revision || parsed.source !== "root") continue;
    if (parsed.state !== "waiting" && parsed.state !== "done") continue;

    const originId =
      "originEventId" in parsed ? parsed.originEventId : message.parentId;
    const origin = originId ? originsById.get(originId) : undefined;
    if (
      !origin ||
      !card?.channelId ||
      origin.pubkey !== currentPubkey ||
      getChannelIdFromTags(origin.tags) !== card.channelId
    )
      continue;

    result.set(message.id, {
      state: parsed.state,
      title: parsed.title,
      href: parsed.href,
      eventId: message.id,
      originEventId: origin.id,
      revisionId: revision.eventId,
      revisionAt: revision.createdAt,
      preview: message.body,
    });
  }
  return result;
}

/** Pick the newest matching report while keeping independent cards in the group. */
export function latestInboxStatus(
  item: InboxItem,
  cards: ReadonlyMap<string, InboxStatusCard>,
  state: InboxStatusCard["state"],
  include: (card: InboxStatusCard) => boolean = () => true,
) {
  let latest: InboxStatusCard | undefined;
  for (const event of item.groupItems) {
    const card = cards.get(event.id);
    if (
      card?.state === state &&
      include(card) &&
      (!latest ||
        card.revisionAt > latest.revisionAt ||
        (card.revisionAt === latest.revisionAt &&
          card.revisionId < latest.revisionId))
    )
      latest = card;
  }
  return latest;
}

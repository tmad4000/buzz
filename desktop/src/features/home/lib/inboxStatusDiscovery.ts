import {
  collectInboxStatusCandidates,
  isVerifiedInboxRelayEvent,
  projectInboxStatusCards,
  toInboxActivityEvent,
} from "@/features/home/lib/inboxStatusCards";
import { BRIDGE_STATUS_SIGNER } from "@/features/messages/lib/bridgeStatusCard";
import { AUX_BACKFILL_CHUNK_SIZE } from "@/shared/api/relayChannelFilters";
import type { RelaySubscriptionFilter } from "@/shared/api/relayClientShared";
import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_FORUM_COMMENT,
  KIND_FORUM_POST,
  KIND_JOB_RESULT,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

const ORIGIN_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_FORUM_POST,
  KIND_FORUM_COMMENT,
];

async function fetchInBatches(
  ids: string[],
  fetch: (chunk: string[]) => Promise<RelayEvent[]>,
) {
  const requests: Promise<RelayEvent[]>[] = [];
  for (let i = 0; i < ids.length; i += AUX_BACKFILL_CHUNK_SIZE) {
    requests.push(fetch(ids.slice(i, i + AUX_BACKFILL_CHUNK_SIZE)));
  }
  return (await Promise.all(requests)).flat();
}

/** Keep additional Inbox reads within currently available channels. */
export async function discoverInboxActivity({
  channelIds,
  currentPubkey,
  limit,
  fetchEvents,
  fetchStructural,
}: {
  channelIds: string[];
  currentPubkey: string;
  limit: number;
  fetchEvents: (filter: RelaySubscriptionFilter) => Promise<RelayEvent[]>;
  fetchStructural: (cardIds: string[]) => Promise<RelayEvent[]>;
}) {
  const availableChannelIds = new Set(channelIds);
  const [recentCards, recentJobs] = await Promise.all([
    fetchInBatches([...availableChannelIds], (ids) =>
      fetchEvents({
        authors: [BRIDGE_STATUS_SIGNER],
        kinds: [KIND_STREAM_MESSAGE],
        "#h": ids,
        limit,
      }),
    ),
    fetchInBatches([...availableChannelIds], (ids) =>
      fetchEvents({
        kinds: [KIND_JOB_RESULT],
        "#h": ids,
        limit,
      }),
    ),
  ]);
  const newest = (events: RelayEvent[], kind: number) =>
    events
      .filter(
        (event) =>
          event.kind === kind &&
          event.tags.filter(([tag]) => tag === "h").length === 1 &&
          availableChannelIds.has(
            event.tags.find(([tag]) => tag === "h")?.[1] ?? "",
          ) &&
          isVerifiedInboxRelayEvent(event),
      )
      .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map(toInboxActivityEvent);
  const { cards, originIds } = collectInboxStatusCandidates(
    newest(
      recentCards.filter((card) => card.pubkey === BRIDGE_STATUS_SIGNER),
      KIND_STREAM_MESSAGE,
    ),
  );
  const [aux, origins] = await Promise.all([
    fetchStructural([...cards.keys()]),
    fetchInBatches(originIds, (ids) =>
      fetchEvents({ ids, kinds: ORIGIN_KINDS, limit: ids.length }),
    ),
  ]);
  const snapshots = projectInboxStatusCards(
    cards,
    aux.filter(isVerifiedInboxRelayEvent),
    origins.filter(
      (event) =>
        ORIGIN_KINDS.includes(event.kind) && isVerifiedInboxRelayEvent(event),
    ),
    currentPubkey,
  );
  return {
    snapshots,
    activity: [
      ...[...cards.values()].filter((card) => snapshots.has(card.id)),
      ...newest(recentJobs, KIND_JOB_RESULT),
    ],
    cardsCapped: recentCards.length >= limit,
    jobsCapped: recentJobs.length >= limit,
  };
}

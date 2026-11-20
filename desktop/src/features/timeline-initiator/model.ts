import { verifyEvent } from "nostr-tools/pure";
import { BRIDGE_STATUS_SIGNER } from "@/features/messages/lib/bridgeStatusCard";
import { getThreadReference } from "@/features/messages/lib/threading";
import type { TimelineMessage } from "@/features/messages/types";
import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";

export const INITIATOR_FEATURE = "timelineInitiator";
export const INITIATOR_FILTERS = ["all", "mine", "agents"] as const;
export type InitiatorFilter = (typeof INITIATOR_FILTERS)[number];
type KnownInitiator = Exclude<InitiatorFilter, "all">;

export type TimelineInitiatorEvidence = {
  roots: ReadonlyMap<string, KnownInitiator>;
  loadedAgentReplies: ReadonlyMap<string, number>;
};

const HEX_ID = /^[0-9a-f]{64}$/;

function verifyRawEvent(event: RelayEvent): boolean {
  const { id, pubkey, kind, created_at, tags, content, sig } = event;
  try {
    return verifyEvent({ id, pubkey, kind, created_at, tags, content, sig });
  } catch {
    return false;
  }
}

/** Classify only visible native roots and count deduplicated loaded replies. */
export function collectTimelineInitiators(
  events: readonly RelayEvent[],
  visibleIds: ReadonlySet<string>,
  channelId: string,
  currentPubkey: string,
  knownAgentPubkeys: ReadonlySet<string>,
): TimelineInitiatorEvidence {
  const roots = new Map<string, KnownInitiator>();
  const loadedAgentReplies = new Map<string, number>();
  const seen = new Set<string>();
  const replies = [];
  for (const event of events) {
    if (
      !visibleIds.has(event.id) ||
      seen.has(event.id) ||
      event.pending ||
      event.localEditedContent ||
      !HEX_ID.test(event.pubkey) ||
      (event.kind !== KIND_STREAM_MESSAGE &&
        event.kind !== KIND_STREAM_MESSAGE_V2)
    )
      continue;

    const isAgent =
      event.pubkey === BRIDGE_STATUS_SIGNER ||
      knownAgentPubkeys.has(event.pubkey);
    const isMine = event.pubkey === currentPubkey;
    if (!isAgent && !isMine) continue;

    const channels = event.tags.filter(([name]) => name === "h");
    if (channels.length !== 1 || channels[0][1] !== channelId) continue;

    const nativeRoots = event.tags.filter(
      ([name, , , marker]) => name === "e" && marker === "root",
    );
    const nativeReplies = event.tags.filter(
      ([name, , , marker]) => name === "e" && marker === "reply",
    );
    if (
      nativeRoots.length > 1 ||
      nativeReplies.length > 1 ||
      (nativeRoots.length && !nativeReplies.length)
    )
      continue;
    const { rootId, parentId } = getThreadReference(event.tags);
    if (
      parentId !== null &&
      (!HEX_ID.test(parentId) || !rootId || !HEX_ID.test(rootId))
    )
      continue;
    if (!verifyRawEvent(event)) continue;

    seen.add(event.id);
    if (parentId === null) {
      roots.set(event.id, isMine ? "mine" : "agents");
    } else if (isAgent && rootId) {
      replies.push(rootId);
    }
  }
  for (const rootId of replies) {
    if (roots.get(rootId) === "mine") {
      loadedAgentReplies.set(rootId, (loadedAgentReplies.get(rootId) ?? 0) + 1);
    }
  }
  return { roots, loadedAgentReplies };
}

export function filterTimelineInitiator<T>(
  items: T[],
  getMessage: (item: T) => TimelineMessage,
  filter: InitiatorFilter,
  evidence?: TimelineInitiatorEvidence,
): T[] {
  if (filter === "all" || !evidence) return items;
  return items.filter((item) => {
    const { id, rootId, parentId } = getMessage(item);
    return evidence.roots.get(rootId ?? parentId ?? id) === filter;
  });
}

export function nextInitiatorFilter(filter: InitiatorFilter): InitiatorFilter {
  return INITIATOR_FILTERS[
    (INITIATOR_FILTERS.indexOf(filter) + 1) % INITIATOR_FILTERS.length
  ];
}

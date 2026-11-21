import type { RelayEvent } from "@/shared/api/types";
import { CHANNEL_TIMELINE_CONTENT_KINDS } from "@/shared/constants/kinds";
import {
  compareRelayOrder,
  flattenChannelWindowEvents,
  type ChannelWindowStore,
} from "./channelWindowStore";
import { reconcileIncomingMessage } from "./messageMerge";
import { getThreadReference, isBroadcastReply } from "./threading";

const CHANNEL_TIMELINE_KINDS = new Set<number>(CHANNEL_TIMELINE_CONTENT_KINDS);

function retainRefetchReconciliationEvents(events: RelayEvent[]) {
  return events.filter((event) => {
    if (!CHANNEL_TIMELINE_KINDS.has(event.kind)) return false;
    if (event.pending) return true;
    const thread = getThreadReference(event.tags);
    return thread.parentId !== null && !isBroadcastReply(event.tags);
  });
}

/**
 * Project the timeline from the authoritative window while retaining local
 * pending sends and non-broadcast thread replies the window does not contain.
 */
export function reconcileChannelWindowMessages(
  window: ChannelWindowStore,
  messages: RelayEvent[],
) {
  const windowEvents = flattenChannelWindowEvents(window);
  if (window.pages.length === 0) {
    // A pageless window is unresolved, not authoritative. This state can exist
    // briefly when the companion window query mounts beside an already-cached
    // rendered timeline. Preserve that cache while admitting live events;
    // otherwise the first live event projects a one-row overlay over the
    // entire conversation until reload refetches page zero.
    let merged = messages;
    for (const event of windowEvents) {
      merged = reconcileIncomingMessage(merged, event);
    }
    return [...merged].sort((left, right) => compareRelayOrder(right, left));
  }
  const authoritativeIds = new Set(windowEvents.map((event) => event.id));
  // The live overlay can contain both a local outbox row and its relay echo
  // before the outbox acceptance callback removes the placeholder. Reconcile
  // that pending row with the echo just like a placeholder in the render cache.
  const retained = [
    ...retainRefetchReconciliationEvents(messages).filter(
      (event) => !authoritativeIds.has(event.id),
    ),
    ...windowEvents.filter((event) => event.pending),
  ];

  // Reconcile acknowledgements against cache-only rows without changing the
  // authoritative window's order. The render key moves from an optimistic row
  // to its relay acknowledgement while the relay row remains in its original
  // cursor position.
  let cacheOnly = retained;
  const presentationById = new Map(
    messages
      .filter((event) => event.localKey || event.localSendIntent)
      .map((event) => [event.id, event]),
  );
  const authoritative: RelayEvent[] = [];
  for (const event of windowEvents) {
    if (event.pending) continue;
    const local = presentationById.get(event.id);
    const canonical =
      local && local.pubkey.toLowerCase() === event.pubkey.toLowerCase()
        ? {
            ...event,
            localKey: event.localKey ?? local.localKey,
            ...((event.localSendIntent ?? local.localSendIntent)
              ? {
                  localSendIntent:
                    event.localSendIntent ?? local.localSendIntent,
                }
              : {}),
          }
        : event;
    const reconciled = reconcileIncomingMessage(cacheOnly, canonical);
    const incoming = reconciled.at(-1);
    cacheOnly = reconciled.slice(0, -1);
    authoritative.push(incoming ?? event);
  }

  return mergeChronologicalMessages(cacheOnly, authoritative);
}

function mergeChronologicalMessages(
  cacheOnly: RelayEvent[],
  authoritative: RelayEvent[],
) {
  const retained = [...cacheOnly].sort((left, right) =>
    compareRelayOrder(right, left),
  );
  const merged: RelayEvent[] = [];
  let retainedIndex = 0;
  let authoritativeIndex = 0;

  while (
    retainedIndex < retained.length &&
    authoritativeIndex < authoritative.length
  ) {
    const retainedEvent = retained[retainedIndex];
    const authoritativeEvent = authoritative[authoritativeIndex];
    if (compareRelayOrder(retainedEvent, authoritativeEvent) > 0) {
      merged.push(retainedEvent);
      retainedIndex += 1;
    } else {
      merged.push(authoritativeEvent);
      authoritativeIndex += 1;
    }
  }

  return merged.concat(
    retained.slice(retainedIndex),
    authoritative.slice(authoritativeIndex),
  );
}

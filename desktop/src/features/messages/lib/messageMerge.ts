import type { RelayEvent } from "@/shared/api/types";
import {
  dedupeMessagesById,
  normalizeTimelineMessages,
  sortMessages,
} from "./messageQueryKeys";
import { getChannelIdFromTags, getThreadReference } from "./threading";

function getLocalRenderKey(message: RelayEvent) {
  return message.localKey ?? message.id;
}

function sameDestination(left: RelayEvent, right: RelayEvent) {
  const a = getThreadReference(left.tags),
    b = getThreadReference(right.tags);
  return (
    left.kind === right.kind &&
    left.pubkey.toLowerCase() === right.pubkey.toLowerCase() &&
    getChannelIdFromTags(left.tags) === getChannelIdFromTags(right.tags) &&
    a.parentId === b.parentId &&
    a.rootId === b.rootId
  );
}

function clientMessageId(event: RelayEvent) {
  return event.tags.find((tag) => tag[0] === "client_msg_id")?.[1];
}

function isMatchingPendingMessage(pending: RelayEvent, incoming: RelayEvent) {
  if (
    !pending.pending ||
    incoming.pending ||
    !sameDestination(pending, incoming)
  )
    return false;
  const pendingId = clientMessageId(pending),
    incomingId = clientMessageId(incoming);
  // Durable attachment bodies can change after upload; identical messages are
  // distinct sends. Never fall back to body matching when either has an ID.
  if (pendingId || incomingId)
    return Boolean(pendingId && pendingId === incomingId);
  return pending.content === incoming.content;
}

export function reconcileIncomingMessage(
  current: RelayEvent[],
  incoming: RelayEvent,
): RelayEvent[] {
  const normalized = dedupeMessagesById(current);
  const clientId = clientMessageId(incoming);
  const existing =
    normalized.find(
      (message) =>
        message.id === incoming.id && sameDestination(message, incoming),
    ) ??
    (clientId
      ? normalized.find(
          (message) =>
            clientMessageId(message) === clientId &&
            sameDestination(message, incoming),
        )
      : undefined) ??
    normalized.find((message) => isMatchingPendingMessage(message, incoming));
  // A delayed durable snapshot cannot turn an already observed relay receipt
  // back into a synthetic pending event.
  const canonical =
    incoming.pending && existing && !existing.pending ? existing : incoming;
  const next = existing
    ? {
        ...canonical,
        localKey:
          canonical.localKey ??
          existing.localKey ??
          (existing.pending ? existing.id : undefined),
        ...((canonical.localSendIntent ?? existing.localSendIntent)
          ? {
              localSendIntent:
                canonical.localSendIntent ?? existing.localSendIntent,
            }
          : {}),
      }
    : canonical;
  const localKey = getLocalRenderKey(next);
  return [
    ...normalized.filter(
      (message) =>
        message.id !== next.id &&
        message.id !== existing?.id &&
        getLocalRenderKey(message) !== localKey,
    ),
    next,
  ];
}

function mergeMessagesWithNormalizer(
  current: RelayEvent[],
  incoming: RelayEvent,
  normalize: (messages: RelayEvent[]) => RelayEvent[],
): RelayEvent[] {
  return normalize(reconcileIncomingMessage(current, incoming));
}

export function mergeMessages(
  current: RelayEvent[],
  incoming: RelayEvent,
): RelayEvent[] {
  return mergeMessagesWithNormalizer(current, incoming, sortMessages);
}

export function mergeTimelineCacheMessages(
  current: RelayEvent[],
  incoming: RelayEvent,
): RelayEvent[] {
  return mergeMessagesWithNormalizer(
    current,
    incoming,
    normalizeTimelineMessages,
  );
}

import { filterOutgoingLinkPreviewTags } from "@/shared/lib/linkPreviewSnapshot";
import type { QueryClient } from "@tanstack/react-query";
import type { RelayEvent } from "@/shared/api/types";
import { buildReplyTags } from "../lib/threading";
import { channelMessagesKey, channelWindowKey } from "../lib/messageQueryKeys";
import {
  compareRelayOrder,
  emptyChannelWindowStore,
  flattenChannelWindowEvents,
  mapChannelWindowEvents,
  type ChannelWindowStore,
} from "../lib/channelWindowStore";
import { reconcileIncomingMessage } from "../lib/messageMerge";
import { projectChannelWindowMessages } from "../lib/projectChannelWindow";
import { reconcileChannelWindowMessages } from "../lib/channelWindowReconciliation";
import type { OutboxRecord } from "./types";

const PREFIX = "outbox-local:";
/** Presentation identity never becomes a signed event/reply destination. */
export const outboxLocalKey = (id: string) => `${PREFIX}${id}`;
const localPending = (event: RelayEvent) =>
  event.pending === true && event.id.startsWith(PREFIX);
const equalEvents = (a: readonly RelayEvent[], b: readonly RelayEvent[]) =>
  JSON.stringify(a) === JSON.stringify(b);

function presentation(row: OutboxRecord) {
  return {
    localKey: outboxLocalKey(row.id),
    ...(row.localSendOrigin
      ? { localSendIntent: { id: row.id, ...row.localSendOrigin } }
      : {}),
  };
}

/** Only durable records may enter this projection, including recovered records.
 * The origin identity distinguishes a new view-owned send from old hydration. */
export function pendingOutboxEvent(row: OutboxRecord): RelayEvent {
  const m = row.message;
  const key = outboxLocalKey(row.id);
  return {
    id: key,
    ...presentation(row),
    pending: true,
    sig: "",
    kind: 9,
    pubkey: m.signerPubkey,
    created_at: row.intendedAt,
    content: m.content,
    tags: [
      ...(m.parentEventId
        ? buildReplyTags(
            m.channelId,
            m.signerPubkey,
            m.parentEventId,
            m.rootEventId ?? m.parentEventId,
            m.mentionPubkeys,
          )
        : [
            ["h", m.channelId],
            ["p", m.signerPubkey],
            ...m.mentionPubkeys.map((pubkey) => ["p", pubkey]),
          ]),
      ...filterOutgoingLinkPreviewTags(m.tags, m.content.trim()).filter(
        (tag) => tag[0] !== "client_msg_id" && tag[0] !== "client_written_at",
      ),
      ["client_msg_id", row.id],
      ["client_written_at", String(row.intendedAt)],
    ],
  };
}

/** Reconcile only our synthetic overlays, without moving authoritative cursors. */
export function projectPendingOutboxRows(
  client: QueryClient,
  rows: readonly OutboxRecord[],
) {
  // Acceptance is checkpointed before the callback. Reconcile it before
  // removing pending so a render cannot temporarily lose the authored row.
  for (const row of rows) {
    if (row.accepted && row.signedEvent && !row.deleted) {
      projectAcceptedOutboxEvent(client, row.signedEvent, row);
    }
  }
  const byChannel = new Map<string, RelayEvent[]>();
  for (const row of rows) {
    if (row.accepted || row.deleted) continue;
    const events = byChannel.get(row.message.channelId) ?? [];
    events.push(pendingOutboxEvent(row));
    byChannel.set(row.message.channelId, events);
  }
  const channels = new Set([
    ...byChannel.keys(),
    ...client
      .getQueriesData<ChannelWindowStore>({ queryKey: ["channel-window"] })
      .map(([key]) => String(key[1])),
    ...client
      .getQueriesData<RelayEvent[]>({ queryKey: ["channel-messages"] })
      .map(([key]) => String(key[1])),
  ]);
  for (const channelId of channels) {
    const key = channelWindowKey(channelId);
    const current =
      client.getQueryData<ChannelWindowStore>(key) ?? emptyChannelWindowStore();
    const cached =
      client.getQueryData<RelayEvent[]>(channelMessagesKey(channelId)) ?? [];
    const settled = [...flattenChannelWindowEvents(current), ...cached].filter(
      (event) => !event.pending,
    );
    const pending = (byChannel.get(channelId) ?? []).filter(
      (event) =>
        !settled.some(
          (accepted) =>
            accepted.localKey === event.localKey ||
            (accepted.pubkey === event.pubkey &&
              accepted.tags.some(
                (tag) =>
                  tag[0] === "client_msg_id" &&
                  tag[1] ===
                    event.tags.find((tag) => tag[0] === "client_msg_id")?.[1],
              )),
        ),
    );
    // Long-offline rows can predate the window: local overlay admission must
    // bypass mergeLiveChannelWindowEvent's authoritative oldest-page boundary.
    const overlay = [
      ...current.liveOverlay.filter((event) => !localPending(event)),
      ...pending,
    ].sort(compareRelayOrder);
    const retained = cached.filter((event) => !localPending(event));
    const sameOverlay = equalEvents(current.liveOverlay, overlay);
    const samePending = equalEvents(
      cached.filter(localPending).sort(compareRelayOrder),
      [...pending].sort(compareRelayOrder),
    );
    if (sameOverlay && samePending) continue;
    const next = { ...current, liveOverlay: overlay };
    if (!sameOverlay) client.setQueryData(key, next);
    client.setQueryData(
      channelMessagesKey(channelId),
      reconcileChannelWindowMessages(next, retained),
    );
  }
}

/** Canonical body/tags win; local ownership survives ID replacement/refetch. */
export function projectAcceptedOutboxEvent(
  client: QueryClient,
  event: RelayEvent,
  row: OutboxRecord,
) {
  if (row.deleted) return;
  const channelId = row.message.channelId;
  const localKey = outboxLocalKey(row.id);
  const metadata = presentation(row);
  const accepted = { ...event, ...metadata, pending: false };
  const key = channelWindowKey(channelId);
  const current =
    client.getQueryData<ChannelWindowStore>(key) ?? emptyChannelWindowStore();
  const mapped = mapChannelWindowEvents(current, (value) =>
    value.id === event.id &&
    (value.pending !== false ||
      value.localKey !== localKey ||
      JSON.stringify(value.localSendIntent) !==
        JSON.stringify(accepted.localSendIntent))
      ? { ...value, ...metadata, pending: false }
      : value,
  );
  const next = {
    ...mapped,
    liveOverlay: mapped.liveOverlay.filter((value) => value.id !== localKey),
    liveAux: mapped.liveAux.filter((value) => value.id !== localKey),
  };
  if (
    !flattenChannelWindowEvents(next).some((value) => value.id === event.id)
  ) {
    next.liveOverlay = [...next.liveOverlay, accepted].sort(compareRelayOrder);
  }
  const cached =
    client.getQueryData<RelayEvent[]>(channelMessagesKey(channelId)) ?? [];
  const reconciled = reconcileIncomingMessage(cached, accepted);
  const windowChanged = !equalEvents(
    flattenChannelWindowEvents(current),
    flattenChannelWindowEvents(next),
  );
  const messagesChanged = !equalEvents(cached, reconciled);
  if (!windowChanged && !messagesChanged) return;
  if (messagesChanged)
    client.setQueryData(channelMessagesKey(channelId), reconciled);
  if (windowChanged) client.setQueryData(key, next);
  projectChannelWindowMessages(client, channelId);
}

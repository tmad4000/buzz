import { prepareOutboxAgents } from "./agentDelivery";
import { revalidateAgentMentionPubkeys } from "../lib/agentMentionRevalidation";
import { listManagedAgents } from "@/shared/api/tauri";
import { revalidateRelayAgents } from "@/shared/api/tauriRelayAgents";
import { startManagedAgent } from "@/shared/api/tauriManagedAgents";
import { OutboxRemovedError } from "./errors";
export { OutboxRemovedError } from "./errors";
import { getRelayHttpUrl, invokeTauri } from "@/shared/api/tauri";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { sendChannelMessage } from "@/shared/api/tauriMessages";
import { releaseMediaUpload, uploadMediaFile } from "@/shared/api/tauriMedia";
import { relayClient } from "@/shared/api/relayClient";
import type { RelayEvent } from "@/shared/api/types";
import {
  buildOutgoingMessage,
  splitOutgoingTags,
} from "../lib/imetaMediaMarkdown";
import { OutboxEngine } from "./engine";
import { outboxStorage } from "./storage";
import type {
  OutboxLookup,
  OutboxMessage,
  OutboxRecord,
  OutboxSubmission,
} from "./types";

let snapshot: readonly OutboxRecord[] = [];
const listeners = new Set<() => void>();
const progress = new Map<string, number>();
const deliveries = new Map<
  string,
  {
    resolve: (event: RelayEvent) => void;
    reject: (error: Error) => void;
    onSuperseded?: () => void;
  }
>();
const acceptedListeners = new Set<
  (event: RelayEvent, row: OutboxRecord) => void
>();
let references = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pumping = false;
let lastError: string | null = null;
let stopReconnect: (() => void) | undefined;
const normalizeRelay = (url: string) => url.replace(/\/+$/, "");

async function refresh(): Promise<void> {
  snapshot = await outboxStorage.all();
  for (const listener of listeners) listener();
}
export function outboxSnapshot(): readonly OutboxRecord[] {
  return snapshot;
}
export function outboxError(): string | null {
  return lastError;
}
export function outboxProgress(id: string): number {
  return progress.get(id) ?? 0;
}
export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const engine = new OutboxEngine(
  outboxStorage,
  {
    async owns(row) {
      const [relayUrl, identity] = await Promise.all([
        getRelayHttpUrl(),
        getIdentity(),
      ]);
      return (
        normalizeRelay(relayUrl) === normalizeRelay(row.message.relayUrl) &&
        identity.pubkey === row.message.signerPubkey &&
        !identity.locked
      );
    },
    async upload(row, index, report) {
      const attachment = row.attachments[index];
      const progressId = `outbox-${row.id}-${index}`;
      const { listen } = await import("@tauri-apps/api/event");
      const stop = await listen<{ id: string; sent: number; total: number }>(
        "media-upload-progress",
        ({ payload }) => {
          if (payload.id === progressId && payload.total > 0)
            report(Math.min(1, payload.sent / payload.total));
        },
      );
      try {
        return await uploadMediaFile(
          new File([attachment.bytes], attachment.name, {
            type: attachment.bytes.type,
          }),
          progressId,
          undefined,
          undefined,
          row.message,
        );
      } finally {
        stop();
        await releaseMediaUpload(progressId);
      }
    },
    async find(row) {
      return invokeTauri<OutboxLookup>("find_queued_message", {
        clientMessageId: row.id,
        signedEventIds: [
          ...new Set([
            ...(row.signedEventIds ?? []),
            ...(row.signedEvent ? [row.signedEvent.id] : []),
          ]),
        ],
        channelId: row.message.channelId,
        expectedRelayUrl: row.message.relayUrl,
        expectedSignerPubkey: row.message.signerPubkey,
      });
    },
    async prepare(row) {
      const m = row.message;
      const uploaded = row.attachments.flatMap((attachment) =>
        attachment.descriptor ? [attachment.descriptor] : [],
      );
      const spoilers = new Set(
        row.attachments.flatMap((attachment) =>
          attachment.spoilered && attachment.descriptor
            ? [attachment.descriptor.url]
            : [],
        ),
      );
      const outgoing = buildOutgoingMessage(m.content, uploaded, spoilers);
      const tags = splitOutgoingTags([
        ...m.tags.filter((tag) => tag[0] !== "buzz:sent-from-thread"),
        ...(outgoing.mediaTags ?? []),
      ]);
      const sentFromThreadTag = m.tags.find(
        (tag) => tag[0] === "buzz:sent-from-thread",
      );
      const result = await sendChannelMessage(
        m.channelId,
        outgoing.content,
        m.parentEventId,
        tags.mediaTags,
        m.mentionPubkeys,
        undefined,
        tags.emojiTags,
        tags.mentionTags,
        tags.linkPreviewTags,
        sentFromThreadTag,
        m.relayUrl,
        m.signerPubkey,
        m.rootEventId,
        true,
        row.id,
        row.intendedAt,
      );
      if (!result.signedEvent)
        throw new Error("Publisher did not prepare a signed event.");
      if (result.signedEvent.pubkey !== m.signerPubkey)
        throw new Error("Publisher identity changed.");
      return result.signedEvent;
    },
    async publish(row) {
      await invokeTauri("publish_queued_message", {
        event: row.signedEvent,
        expectedRelayUrl: row.message.relayUrl,
        expectedSignerPubkey: row.message.signerPubkey,
      });
    },
    prepareAgents: prepareOutboxAgents,
    async authorize(row) {
      if (!row.agentPubkeys?.length) return;
      await revalidateAgentMentionPubkeys({
        pubkeys: row.message.mentionPubkeys,
        agentPubkeys: new Set(row.agentPubkeys),
        currentPubkey: row.message.signerPubkey,
        eligibilityScope: { type: "channel", channelId: row.message.channelId },
        sharedChannelIds: new Set([row.message.channelId]),
        refetchManagedAgents: async () => ({
          data: await listManagedAgents(),
          error: null,
        }),
        fetchRelayAgents: (pubkeys) =>
          revalidateRelayAgents(pubkeys, row.message.channelId),
      });
    },
    async wake(row, pubkey, replayFloorUnix) {
      await startManagedAgent(pubkey, {
        expectedRelayUrl: row.message.relayUrl,
        expectedSignerPubkey: row.message.signerPubkey,
        replayFloorUnix,
      });
    },
    accepted(row) {
      const event = row.signedEvent;
      if (!event) return;
      deliveries.get(row.id)?.resolve(event);
      deliveries.delete(row.id);
      progress.delete(row.id);
      if (!row.deleted)
        for (const listener of acceptedListeners) listener(event, row);
    },
  },
  refresh,
  (id, value) => {
    progress.set(id, value);
    // New array identity lets useSyncExternalStore render progress updates.
    snapshot = [...snapshot];
    for (const listener of listeners) listener();
  },
);

async function withLock<T>(action: () => Promise<T>): Promise<T> {
  if (!navigator.locks)
    throw new Error("This webview does not support durable outbox locking.");
  return navigator.locks.request("buzz-message-outbox-v1", action);
}

async function pump(): Promise<void> {
  if (pumping || references === 0) return;
  pumping = true;
  clearTimeout(timer);
  try {
    await withLock(async () => {
      await refresh();
      await engine.drain();
    });
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    for (const listener of listeners) listener();
  } finally {
    pumping = false;
    if (references > 0) timer = setTimeout(() => void pump(), 1_000);
  }
}

/** One application-wide worker, independent of composer visits and drafts. */
export function startOutbox(
  onAccepted: (event: RelayEvent, row: OutboxRecord) => void,
): () => void {
  references++;
  acceptedListeners.add(onAccepted);
  if (references === 1) {
    window.addEventListener("online", wakeOutbox);
    stopReconnect = relayClient.subscribeToReconnects(wakeOutbox);
    void refresh()
      .then(wakeOutbox)
      .catch((error: unknown) => {
        lastError = String(error);
        for (const listener of listeners) listener();
      });
    wakeOutbox();
  }
  return () => {
    acceptedListeners.delete(onAccepted);
    references--;
    if (references === 0) {
      clearTimeout(timer);
      window.removeEventListener("online", wakeOutbox);
      stopReconnect?.();
    }
  };
}
export function wakeOutbox(): void {
  void pump();
}

function notifyCommit(submission: OutboxSubmission): void {
  try {
    submission.onQueued();
  } catch (error) {
    lastError = String(error);
    for (const listener of listeners) listener();
  }
}

/** A failed storage commit leaves the caller's composer and files untouched. */
export async function enqueueOutbox(
  message: OutboxMessage,
  submission: OutboxSubmission,
): Promise<RelayEvent> {
  if (!navigator.locks)
    throw new Error("This webview does not support durable outbox locking.");
  const record = await outboxStorage.add({
    id: crypto.randomUUID(),
    sequence: 0,
    revision: 0,
    intendedAt: Math.floor(Date.now() / 1000),
    message,
    attachments: submission.attachments.map((attachment) => ({
      bytes: attachment.file,
      name: attachment.file.name,
      spoilered: attachment.spoilered,
    })),
    agentPubkeys: submission.agentPubkeys,
    wakes: submission.wakes,
    mentionRefs: submission.mentionRefs,
    state: "waiting",
    attempts: 0,
    nextAttemptAt: 0,
  });
  const delivered = new Promise<RelayEvent>((resolve, reject) =>
    deliveries.set(record.id, {
      resolve,
      reject,
      onSuperseded: submission.onSuperseded,
    }),
  );
  notifyCommit(submission);
  void refresh().catch((error: unknown) => {
    lastError = String(error);
  });
  wakeOutbox();
  return delivered;
}

/** Retry preserves any signed bytes, including an ambiguous previous attempt. */
export async function retryOutbox(id: string): Promise<void> {
  await (async () => {
    const row = (await outboxStorage.all()).find((record) => record.id === id);
    if (!row) return;
    if (row.state === "sending")
      throw new Error("This message is currently sending.");
    row.state = "waiting";
    row.nextAttemptAt = 0;
    await outboxStorage.put(row);
    await refresh();
  })();
  wakeOutbox();
}

/** Explicit removal never restores the obsolete composer draft. */
export async function deleteOutbox(id: string): Promise<void> {
  const row = (await outboxStorage.all()).find((record) => record.id === id);
  if (!row) throw new Error("Message already sent or deleted.");
  if (row.state === "sending")
    throw new Error("This message is currently sending.");
  await outboxStorage.remove(id, row.revision);
  await refresh();
  deliveries.get(id)?.reject(new OutboxRemovedError("Queued message deleted."));
  deliveries.delete(id);
}

/** Pause delivery before a mention-aware composer acquires edit ownership. */
export async function beginOutboxEdit(id: string): Promise<OutboxRecord> {
  const row = (await outboxStorage.all()).find((record) => record.id === id);
  if (!row) throw new Error("Message already sent or deleted.");
  if (row.accepted || row.deliveryUncertain || row.state === "sending")
    throw new Error("Retry to confirm delivery before editing this message.");
  if (row.state !== "editing") {
    row.editPreviousState = row.state;
    row.state = "editing";
    await outboxStorage.put(row);
    row.revision++;
    await refresh();
  }
  return row;
}

export async function cancelOutboxEdit(id: string): Promise<void> {
  const row = (await outboxStorage.all()).find((record) => record.id === id);
  if (!row || row.state !== "editing") return;
  row.state = row.editPreviousState ?? "waiting";
  await outboxStorage.put(row);
  await refresh();
  wakeOutbox();
}

/** Replace content and its exact recipient/media bindings in one transaction. */
export async function editOutbox(
  id: string,
  content: string,
  tags: string[][],
  mentionPubkeys: string[],
  submission: OutboxSubmission,
): Promise<void> {
  const row = (await outboxStorage.all()).find((record) => record.id === id);
  if (!row || row.state !== "editing")
    throw new Error("This queued edit no longer owns the message.");
  if (row.deliveryUncertain || row.accepted)
    throw new Error("Retry to confirm delivery before editing this message.");
  row.message = {
    ...row.message,
    content,
    tags: [
      ...tags,
      ...row.message.tags.filter((tag) => tag[0] === "buzz:sent-from-thread"),
    ],
    mentionPubkeys,
  };
  row.attachments = submission.attachments.map((attachment) => ({
    bytes: attachment.file,
    name: attachment.file.name,
    spoilered: attachment.spoilered,
  }));
  row.mentionRefs = submission.mentionRefs;
  row.agentPubkeys = submission.agentPubkeys;
  row.wakes = submission.wakes;
  row.signedEvent = undefined;
  row.agentsPrepared = false;
  row.state = "waiting";
  row.nextAttemptAt = 0;
  row.error = undefined;
  await outboxStorage.put(row);
  deliveries.get(id)?.onSuperseded?.();
  notifyCommit(submission);
  await refresh();
  wakeOutbox();
}

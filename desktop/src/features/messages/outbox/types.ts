import type { RelayEvent } from "@/shared/api/types";
import type { ImetaMedia } from "../lib/imetaMediaMarkdown";
import type { QueuedMediaAttachment } from "../lib/backgroundMediaUploadStore";

/** Files transfer to the outbox only after its durable commit succeeds. */
export type OutboxSubmission = {
  attachments: QueuedMediaAttachment[];
  onQueued: () => void;
  onSuperseded?: () => void;
  scope?: { relayUrl: string; signerPubkey: string };
  mentionRefs?: import("../lib/useDrafts").DraftMentionRef[];
  agentPubkeys?: string[];
  wakes?: Array<{ pubkey: string; replayFloorUnix: number }>;
};

/** Immutable destination captured before any deferred upload starts. */
export type OutboxMessage = {
  channelId: string;
  parentEventId: string | null;
  rootEventId: string | null;
  content: string;
  mentionPubkeys: string[];
  tags: string[][];
  relayUrl: string;
  signerPubkey: string;
  channel?: import("@/shared/api/types").Channel;
};

export type OutboxAttachment = {
  bytes: Blob;
  name: string;
  spoilered: boolean;
  descriptor?: ImetaMedia;
};

/** Stored separately from derived timeline caches and composer drafts. */
export type OutboxRecord = {
  id: string;
  sequence: number;
  revision: number;
  intendedAt: number;
  message: OutboxMessage;
  attachments: OutboxAttachment[];
  signedEvent?: RelayEvent;
  signedEventIds?: string[];
  deleted?: boolean;
  mentionRefs?: import("../lib/useDrafts").DraftMentionRef[];
  agentPubkeys?: string[];
  wakes?: Array<{ pubkey: string; replayFloorUnix: number }>;
  accepted?: boolean;
  agentsPrepared?: boolean;
  state: "waiting" | "sending" | "failed" | "editing";
  attempts: number;
  nextAttemptAt: number;
  error?: string;
  deliveryUncertain?: boolean;
  editPreviousState?: "waiting" | "failed";
};

export interface OutboxStorage {
  all(): Promise<OutboxRecord[]>;
  put(record: OutboxRecord): Promise<void>;
  add(record: OutboxRecord): Promise<OutboxRecord>;
  remove(id: string, expectedRevision?: number): Promise<void>;
}

export type OutboxLookup = { event: RelayEvent } | { deleted: true } | null;

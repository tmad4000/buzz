import type { RelayEvent } from "@/shared/api/types";
import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_STREAM_MESSAGE_DIFF,
} from "@/shared/constants/kinds";
import { getChannelIdFromTags, getThreadReference } from "../lib/threading";
import {
  isReg,
  type Reg,
  type Tree,
} from "@/features/sidebar/lib/sidebarLwwMap";
import type { Lane } from "@/features/sidebar/lib/sidebarLaneReconciler";

export type ArchiveTarget = {
  channelId: string;
  rootId: string;
  targetId: string;
  kind: "message" | "thread";
  archivedAt: number;
  replyIds?: string[];
};
export const ARCHIVE_BUCKETS = 64;
export const archiveKey = (kind: ArchiveTarget["kind"], id: string) =>
  `${kind === "thread" ? "t" : "m"}:${id}`;
/** Opaque fixed buckets keep canonical message/channel IDs inside ciphertext. */
export function archiveBucket(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % ARCHIVE_BUCKETS;
}
export function validArchive(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "object" || !value) return false;
  const item = value as ArchiveTarget;
  return (
    [item.channelId, item.rootId, item.targetId].every(
      (id) => typeof id === "string" && id.length > 0 && id.length <= 128,
    ) &&
    (item.kind === "message" || item.kind === "thread") &&
    Number.isSafeInteger(item.archivedAt) &&
    item.archivedAt >= 0 &&
    (item.replyIds === undefined ||
      (Array.isArray(item.replyIds) &&
        item.replyIds.every(
          (id) => typeof id === "string" && id.length <= 128,
        )))
  );
}
/** Same encrypted kind30078 settings lane/reconciler, isolated from read progress. */
export function archiveLane(bucket: number): Lane {
  const dTag = `personal-archive-v1:${bucket.toString(16).padStart(2, "0")}`;
  return {
    dTag,
    storageKey: (pubkey, relayUrl) =>
      `buzz.${dTag}:${encodeURIComponent(relayUrl)}:${pubkey}`,
    shape: {
      a: { "*": validArchive },
      show: { "*": (value) => typeof value === "boolean" },
    },
    fromLegacy: () => null,
    project: () => ({}),
    withinLimits: () => true, // Engine rejects oversized edits before persisting.
  };
}
export function archiveEntries(
  tree: Tree,
): Array<[string, Reg<ArchiveTarget | null>]> {
  return Object.entries(tree.a ?? {}).filter(
    (entry): entry is [string, Reg<ArchiveTarget | null>] =>
      isReg(entry[1]) && validArchive(entry[1][2]),
  );
}

export const ARCHIVE_REPLY_KINDS = [
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
  KIND_STREAM_MESSAGE_DIFF,
];
/** Auxiliary edits/reactions and system/job lifecycle events are never new replies. */
export function isArchiveReply(
  event: RelayEvent,
  channelId: string,
  rootId: string,
): boolean {
  const reference = getThreadReference(event.tags);
  return (
    ARCHIVE_REPLY_KINDS.includes(event.kind) &&
    getChannelIdFromTags(event.tags) === channelId &&
    Boolean(reference.parentId) &&
    reference.rootId === rootId
  );
}

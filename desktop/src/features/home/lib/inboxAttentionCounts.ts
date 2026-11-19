import { isHomeBadgeFeedItemUnread } from "@/features/notifications/lib/homeBadge";
import { unseenRepliesByRoot } from "@/features/channels/lib/unseenReplies";
import { getThreadReference } from "@/features/messages/lib/threading";
import type { TimelineMessage } from "@/features/messages/types";
import type { InboxItem } from "./inbox";

export type InboxAttentionCounts = {
  /** Existing Inbox read-progress projection, not exact body observation. */
  newSinceRead: number;
  /** Null while exact-observed markers/identity are unavailable. */
  unseenReplies: number | null;
  coverage: "loaded";
};

/** Decorate the canonical Inbox pipeline with loaded-only counts. No store,
 * fetch, receipt writes, global numeral changes, or inferred read frontier.
 */
export function withInboxAttentionCounts(
  items: readonly InboxItem[],
  reader: string | undefined,
  getObservedAt: (rootId: string, replyId: string) => number | null,
  ready: boolean,
  progress?: Parameters<typeof isHomeBadgeFeedItemUnread>[1],
): InboxItem[] {
  const messages: TimelineMessage[] = [];
  for (const item of items) {
    for (const event of item.groupItems) {
      const thread = getThreadReference(event.tags);
      if (!thread.parentId) continue;
      messages.push({
        id: event.id,
        kind: event.kind,
        pubkey: event.pubkey,
        rootId: thread.rootId ?? thread.parentId,
        parentId: thread.parentId,
        createdAt: event.createdAt,
        author: "",
        body: "",
        time: "",
        depth: 1,
      });
    }
  }
  // The owner selector deduplicates IDs and excludes own/pending/non-chat events.
  const unseen =
    ready && reader
      ? unseenRepliesByRoot(messages, reader, getObservedAt)
      : null;
  const unseenIds = unseen
    ? new Set(
        [...unseen.values()].flatMap((replies) =>
          replies.map((reply) => reply.id),
        ),
      )
    : null;
  return items.map((item) => ({
    ...item,
    attentionCounts: {
      newSinceRead: progress
        ? [
            ...new Map(
              item.groupItems.map((event) => [event.id, event]),
            ).values(),
          ].filter((event) => isHomeBadgeFeedItemUnread(event, progress)).length
        : item.unreadCount,
      unseenReplies: unseenIds
        ? [...new Set(item.groupItems.map((event) => event.id))].filter((id) =>
            unseenIds.has(id),
          ).length
        : null,
      coverage: "loaded",
    },
  }));
}

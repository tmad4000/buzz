import { maxReadAt } from "@/features/channels/readState/readStateFormat";
import {
  getThreadReference,
  isBroadcastReply,
} from "@/features/messages/lib/threading";
import { hasMentionForEvent } from "@/features/notifications/lib/shouldNotify";
import type { FeedItem } from "@/shared/api/types";

export type SidebarUnreadCount = {
  count: number;
  coverage: "exact" | "partial";
};

export function describeSidebarUnreadBadge({
  evidence,
  hasUnread,
  hasMention,
  suppressed,
}: {
  evidence: SidebarUnreadCount | undefined;
  hasUnread: boolean;
  hasMention: boolean;
  suppressed: boolean;
}) {
  if (suppressed) return null;

  if (!evidence || evidence.count <= 0) {
    if (!hasUnread && !hasMention) return null;
    return {
      text: null,
      label: hasMention ? "Unread mention" : "Unread messages",
    };
  }

  const { count, coverage } = evidence;
  const text =
    count > 99 ? "99+" : `${count}${coverage === "partial" ? "+" : ""}`;
  const quantity = coverage === "partial" ? `At least ${count}` : String(count);
  const messages = count === 1 ? "unread message" : "unread messages";
  return {
    text,
    label: `${quantity} ${messages}${hasMention ? ", including a mention" : ""}`,
  };
}

export function getSidebarUnreadMentionChannelIds({
  mentions,
  pubkey,
  unreadIds,
  doneIds,
  getChannelReadAt,
  getOwnReadAt,
}: {
  mentions: readonly FeedItem[];
  pubkey: string;
  unreadIds: ReadonlySet<string>;
  doneIds: ReadonlySet<string>;
  getChannelReadAt: (channelId: string) => number | null;
  getOwnReadAt: (contextKey: string) => number | null;
}): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const item of mentions) {
    if (
      !item.channelId ||
      item.pubkey.toLowerCase() === pubkey ||
      !hasMentionForEvent(item, pubkey)
    ) {
      continue;
    }
    const { rootId, parentId } = getThreadReference(item.tags);
    const threadId = isBroadcastReply(item.tags) ? null : (rootId ?? parentId);
    const readAt = maxReadAt(
      getChannelReadAt(item.channelId),
      getOwnReadAt(`msg:${item.id}`),
      threadId ? getOwnReadAt(`thread:${threadId}`) : null,
    );
    if (
      unreadIds.has(item.id) ||
      (!doneIds.has(item.id) && (readAt === null || item.createdAt > readAt))
    ) {
      ids.add(item.channelId);
    }
  }
  return ids;
}

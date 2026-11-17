import * as React from "react";
import { useConversationReadAdmission } from "@/features/conversations/ConversationViewContext";

import { useAppShell } from "@/app/AppShellContext";
import { isThreadReply } from "@/features/messages/lib/threading";
import type { FeedItem } from "@/shared/api/types";

/**
 * Inbox overrides for top-level rows are consumed by opening the channel.
 * Thread-reply overrides intentionally remain until their thread is read.
 */
export function getTopLevelInboxUnreadOverrideIds(
  items: FeedItem[],
  channelId: string,
): string[] {
  return items.flatMap((item) =>
    item.channelId === channelId && !isThreadReply(item.tags) ? [item.id] : [],
  );
}

export function useChannelOpenReadState(
  activeChannelId: string | null,
  isChannelMember: boolean | undefined,
  activeReadAt: string | null,
) {
  const { canRead } = useConversationReadAdmission();
  const { feedItemState, locallyUnreadFeedItems, markChannelRead } =
    useAppShell();

  React.useEffect(() => {
    if (!canRead() || !activeChannelId || isChannelMember === false) return;
    for (const itemId of getTopLevelInboxUnreadOverrideIds(
      locallyUnreadFeedItems,
      activeChannelId,
    )) {
      feedItemState.undoUnread(itemId);
    }
    markChannelRead(activeChannelId, activeReadAt, { topLevelOnly: true });
  }, [
    canRead,
    activeChannelId,
    activeReadAt,
    feedItemState.undoUnread,
    isChannelMember,
    locallyUnreadFeedItems,
    markChannelRead,
  ]);
}

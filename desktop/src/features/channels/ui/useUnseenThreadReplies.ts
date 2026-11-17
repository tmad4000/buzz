import { canonicalThreadRootId } from "@/features/messages/lib/applyThreadLinkPresentation";
import * as React from "react";
import { useConversationReadAdmission } from "@/features/conversations/ConversationViewContext";
import { unseenRepliesByRoot } from "../lib/unseenReplies";
import type { TimelineMessage } from "@/features/messages/types";

/** Observation is distinct from inherited unread progress and explicit review. */
export function useUnseenThreadReplies({
  timelineMessages,
  panelMessages,
  currentPubkey,
  getSeenAt,
  markSeen,
  markRead,
  readStateVersion,
}: {
  timelineMessages: TimelineMessage[];
  panelMessages: TimelineMessage[];
  currentPubkey?: string;
  getSeenAt: (rootId: string, replyId: string) => number | null;
  markSeen: (rootId: string, replyId: string, timestamp: number) => void;
  markRead: (messages: TimelineMessage[], rootId?: string) => void;
  readStateVersion: number;
}) {
  const { canRead } = useConversationReadAdmission();
  // biome-ignore lint/correctness/useExhaustiveDependencies: synced markers invalidate this projection.
  const unseenReplies = React.useMemo(
    () =>
      unseenRepliesByRoot(
        [...timelineMessages, ...panelMessages],
        currentPubkey,
        getSeenAt,
      ),
    [
      timelineMessages,
      panelMessages,
      currentPubkey,
      getSeenAt,
      readStateVersion,
    ],
  );
  const threadUnseenCounts = React.useMemo(
    () =>
      new Map([...unseenReplies].map(([id, replies]) => [id, replies.length])),
    [unseenReplies],
  );
  const markVisibleReplies = React.useCallback(
    (messages: TimelineMessage[], rootId?: string) => {
      if (!canRead()) return;
      markRead(messages, rootId);
      for (const message of messages) {
        const canonicalRoot =
          message.canonicalRootId !== undefined
            ? canonicalThreadRootId(message)
            : (message.rootId ?? rootId);
        if (
          canonicalRoot &&
          message.pubkey !== currentPubkey &&
          !message.pending
        )
          markSeen(canonicalRoot, message.id, message.createdAt);
      }
    },
    [canRead, markRead, markSeen, currentPubkey],
  );
  return { unseenReplies, threadUnseenCounts, markVisibleReplies };
}

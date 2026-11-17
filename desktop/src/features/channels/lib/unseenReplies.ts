import { isConversationalUnreadKind } from "@/shared/constants/kinds";
import type { TimelineMessage } from "@/features/messages/types";

/** Seen is observation of this reply, independent of channel reads or review. */
export function unseenRepliesByRoot(
  messages: readonly TimelineMessage[],
  reader: string | undefined,
  seenAt: (rootId: string, replyId: string) => number | null,
): Map<string, TimelineMessage[]> {
  const roots = new Map<string, TimelineMessage[]>();
  const ids = new Set<string>();
  if (!reader) return roots;
  for (const message of messages) {
    const rootId = message.rootId;
    if (
      (message.kind !== undefined &&
        !isConversationalUnreadKind(message.kind)) ||
      !rootId ||
      rootId === message.id ||
      !message.parentId ||
      message.pending ||
      message.pubkey === reader ||
      ids.has(message.id)
    )
      continue;
    ids.add(message.id);
    if ((seenAt(rootId, message.id) ?? -1) >= message.createdAt) continue;
    const replies = roots.get(rootId) ?? [];
    replies.push(message);
    roots.set(rootId, replies);
  }
  return roots;
}

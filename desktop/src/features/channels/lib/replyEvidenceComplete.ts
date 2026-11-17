import { getThreadReference } from "@/features/messages/lib/threading";
import type { RelayEvent, ThreadSummary } from "@/shared/api/types";
import { CHANNEL_TIMELINE_CONTENT_KINDS } from "@/shared/constants/kinds";
const kinds = new Set<number>(CHANNEL_TIMELINE_CONTENT_KINDS);

/** Summary-ahead-of-body replication is incomplete, even after a successful fetch. */
export function replyEvidenceComplete(
  events: RelayEvent[],
  rootId: string,
  summary: ThreadSummary,
): boolean {
  const replies = new Map(
    events
      .filter((event) => {
        const thread = getThreadReference(event.tags);
        return (
          kinds.has(event.kind) && thread.parentId && thread.rootId === rootId
        );
      })
      .map((event) => [event.id, event]),
  );
  let latest = 0;
  for (const event of replies.values())
    latest = Math.max(latest, event.created_at);
  return (
    replies.size >= summary.descendantCount &&
    latest >= (summary.lastReplyAt ?? 0)
  );
}

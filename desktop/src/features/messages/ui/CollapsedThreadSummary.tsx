import type { TimelineMessage } from "../types";
import type { TimelineThreadSummary } from "../lib/threadPanel";
import { formatThreadSummaryLastReplyTime } from "../lib/dateFormatters";
import {
  getThreadReplyIndentRem,
  THREAD_REPLY_BODY_OFFSET_REM,
} from "../lib/threadTreeLayout";
export function CollapsedThreadSummary({
  message,
  summary,
  latestAuthor,
  onToggle,
}: {
  message: TimelineMessage;
  summary: TimelineThreadSummary;
  latestAuthor?: string;
  onToggle: (message: TimelineMessage) => void;
}) {
  const indent =
    getThreadReplyIndentRem(Math.min(2, message.depth)) +
    THREAD_REPLY_BODY_OFFSET_REM;
  return (
    <button
      type="button"
      aria-expanded="false"
      data-testid="sidebar-read-branch"
      data-thread-head-id={message.id}
      className="block h-8 truncate rounded text-left text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2"
      style={{
        marginInlineStart: `${indent}rem`,
        maxWidth: `calc(100% - ${indent}rem)`,
      }}
      onClick={() => onToggle(message)}
    >
      {summary.replyCount} {summary.replyCount === 1 ? "reply" : "replies"} ·
      last {latestAuthor ?? summary.participants.at(-1)?.author ?? "reply"}{" "}
      {summary.lastReplyAt
        ? formatThreadSummaryLastReplyTime(summary.lastReplyAt)
        : ""}
    </button>
  );
}

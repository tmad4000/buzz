import type { TimelineMessage } from "@/features/messages/types";
import { useTimelineView } from "./TimelineViewContext";
import { quoteExcerpt } from "./useTimelineInPlaceReply";

/** Reply context is presentation only; it never participates in timeline sorting. */
export function TimelineReplyChip({ message }: { message: TimelineMessage }) {
  const { mode, messagesById, jumpToMessage, openReply } = useTimelineView();
  if (mode !== "timeline" || !message.parentId) return null;
  const parentId = message.parentId;
  const parent = messagesById?.get(parentId);
  const author = parent?.author ?? "Unknown author";
  const excerpt = parent ? quoteExcerpt(parent.body) : "Message unavailable";
  return (
    <button
      type="button"
      data-testid="timeline-reply-quote"
      onClick={() => {
        // A parent outside the loaded Timeline still has its thread to open.
        if (parent && jumpToMessage)
          jumpToMessage(parentId, () => openReply?.(message));
        else openReply?.(message);
      }}
      aria-label={
        parent
          ? `Jump to original from ${author}: ${excerpt}`
          : "Original message is not loaded. Open its thread"
      }
      className="mx-4 mb-1 flex max-w-full min-w-0 items-baseline gap-1.5 self-start rounded-r-md border-l-2 border-primary/60 bg-muted/50 px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:mx-6"
    >
      <span className="shrink-0 font-medium text-foreground">{author}</span>
      <span className="min-w-0 truncate">{excerpt}</span>
    </button>
  );
}

import type { TimelineMessage } from "@/features/messages/types";
import { useTimelineView } from "./TimelineViewContext";

/** Reply context is presentation only; it never participates in timeline sorting. */
export function TimelineReplyChip({ message }: { message: TimelineMessage }) {
  const { mode, messagesById, openReply } = useTimelineView();
  if (mode !== "timeline" || !message.parentId) return null;
  const parent = messagesById?.get(message.parentId);
  const excerpt =
    parent?.body.replace(/\s+/g, " ").trim() ?? "Message unavailable";
  return (
    <button
      type="button"
      onClick={() => openReply?.(message)}
      title="Open this reply in Threads"
      className="mx-4 mb-1 max-w-full self-start truncate rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary sm:mx-6"
    >
      ↳ in reply to {parent?.author ?? "Unknown author"}: {excerpt.slice(0, 60)}
      {excerpt.length > 60 ? "…" : ""}
    </button>
  );
}

import type { TimelineMessage } from "@/features/messages/types";

/** A compact next-thread affordance; opening alone never acknowledges a reply. */
export function UnseenRepliesButton({
  replies,
  currentRoot,
  onOpen,
  checking = false,
  failed = false,
  onRetry,
}: {
  checking?: boolean;
  failed?: boolean;
  onRetry?: () => void;
  replies: ReadonlyMap<string, TimelineMessage[]>;
  currentRoot: string | null;
  onOpen: (rootId: string, replyId: string) => void;
}) {
  const count = [...replies.values()].reduce(
    (total, items) => total + items.length,
    0,
  );
  if (failed)
    return (
      <button
        type="button"
        className="text-xs text-muted-foreground underline"
        onClick={onRetry}
      >
        Retry unseen replies
      </button>
    );
  if (!count)
    return checking ? (
      <span role="status" className="text-xs text-muted-foreground">
        Checking unseen replies…
      </span>
    ) : null;
  return (
    <button
      type="button"
      className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      title="Open the next thread with unseen replies"
      onClick={() => {
        const ids = [...replies.keys()];
        const next = ids[(ids.indexOf(currentRoot ?? "") + 1) % ids.length];
        const reply = replies.get(next)?.[0];
        if (reply) onOpen(next, reply.id);
      }}
    >
      Unseen replies ({count}
      {checking ? "+" : ""})
    </button>
  );
}

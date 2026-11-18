import { useFeatureEnabled } from "@/shared/features";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { threadParentQuote } from "@/features/messages/lib/threadParentQuote";
import type { TimelineMessage } from "@/features/messages/types";

export function ThreadParentQuoteChip({
  channelId,
  message,
  messages,
  onJumpToThreadMessage,
}: {
  channelId: string;
  message: TimelineMessage;
  messages: ReadonlyMap<string, TimelineMessage>;
  onJumpToThreadMessage?: (rootId: string, messageId: string) => void;
}) {
  const { goChannel } = useAppNavigation();
  const enabled = useFeatureEnabled("agentReplyUx");
  const quote = threadParentQuote(message, messages, channelId);
  if (!enabled || !quote) return null;
  return (
    <div className="min-w-0 pb-0.5 pl-14 pt-1">
      <button
        type="button"
        data-testid="thread-parent-quote"
        data-parent-message-id={quote.parentId}
        className="block max-w-full truncate rounded bg-muted/60 px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={`Jump to parent: ${quote.excerpt}`}
        aria-label={`Jump to parent: ${quote.excerpt}`}
        onClick={() => {
          if (onJumpToThreadMessage) {
            onJumpToThreadMessage(quote.rootId, quote.parentId);
            return;
          }
          void goChannel(channelId, {
            messageId: quote.parentId,
            threadRootId: quote.rootId,
            force: true,
          });
        }}
      >
        <span aria-hidden="true">↪ </span>re: {quote.excerpt}
      </button>
    </div>
  );
}

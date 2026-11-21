import { useFeatureEnabled } from "@/shared/features";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { threadParentQuote } from "@/features/messages/lib/threadParentQuote";

export function ThreadParentQuoteChip({
  channelId,
  quote,
  onJumpToThreadMessage,
  inThreadPanel = false,
}: {
  channelId: string;
  quote: NonNullable<ReturnType<typeof threadParentQuote>>;
  inThreadPanel?: boolean;
  onJumpToThreadMessage?: (rootId: string, messageId: string) => void;
}) {
  const { goChannel } = useAppNavigation();
  const enabled = useFeatureEnabled("agentReplyUx");
  // The standard thread panel only opts in with its local guarded jump.
  // Inline previews and route-based fallbacks keep the existing experiment.
  const panelCue = inThreadPanel && Boolean(onJumpToThreadMessage);
  if (!enabled && !panelCue) return null;
  const parentLabel =
    panelCue && quote.parentAuthor
      ? `${quote.parentAuthor}: ${quote.excerpt}`
      : quote.excerpt;
  return (
    <div className="min-w-0 pb-0.5 pl-14 pt-1">
      {!quote.parentLoaded ? (
        <span
          data-testid="thread-parent-stub"
          className="text-xs text-muted-foreground"
        >
          reply to earlier message
        </span>
      ) : (
        <button
          type="button"
          data-testid="thread-parent-quote"
          data-parent-message-id={quote.parentId}
          className="block max-w-full truncate rounded bg-muted/60 px-2 py-0.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={`Jump to parent: ${parentLabel}`}
          aria-label={`Jump to parent: ${parentLabel}`}
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
          <span aria-hidden="true">{panelCue ? "↳ " : "↪ "}</span>
          {panelCue ? `Replying to ${parentLabel}` : `re: ${quote.excerpt}`}
        </button>
      )}
    </div>
  );
}

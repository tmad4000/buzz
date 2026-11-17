import * as React from "react";
import type { TimelineMessage } from "@/features/messages/types";
import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { MessageTimelineHandle } from "@/features/messages/ui/MessageTimeline";

type Receipt = { root: TimelineMessage; title: string; messageId: string };
/** A receipt belongs to one channel in one mounted conversation view. */
export function useRoutedSendReturn({
  channelId,
  channelName,
  entries,
  timeline,
  onOpenThread,
  onCloseThread,
  previousThread,
  capturePanelReturn,
  onOpenSentReply,
}: {
  channelId: string | null;
  channelName: string;
  entries: MainTimelineEntry[];
  timeline: React.RefObject<MessageTimelineHandle | null>;
  onOpenThread: (message: TimelineMessage) => void;
  onCloseThread: () => void;
  previousThread: TimelineMessage | null;
  capturePanelReturn?: () => (() => boolean) | undefined;
  onOpenSentReply?: (root: TimelineMessage, messageId: string) => void;
}) {
  const [receipts, setReceipts] = React.useState<Map<string, Receipt>>(
    () => new Map(),
  );
  const [error, setError] = React.useState("");
  const [back, setBack] = React.useState<{
    channel: string;
    destination: string;
    restore: () => boolean;
  } | null>(null);
  const noticeRef = React.useRef<HTMLDivElement>(null);
  const cleanup = React.useRef<(() => void) | undefined>(undefined);
  React.useEffect(() => () => cleanup.current?.(), []);
  const receipt = channelId ? receipts.get(channelId) : undefined;
  const captureSend = (rootId: string) => {
    const root = entries.find((entry) => entry.message.id === rootId)?.message;
    if (!root || !channelId) return;
    const origin = channelId;
    const value = {
      root,
      title: root.body.replace(/\s+/g, " ").trim() || "thread",
    };
    return (messageId?: string) => {
      if (messageId)
        setReceipts((current) =>
          new Map(current).set(origin, { ...value, messageId }),
        );
    };
  };
  const open = () => {
    if (!receipt || !channelId) return;
    const root = entries.find(
      (entry) => entry.message.id === receipt.root.id,
    )?.message;
    if (!root) {
      setError(
        "This thread is no longer available. Your message will not be resent.",
      );
      return;
    }
    const restorePanel = capturePanelReturn?.();
    if (capturePanelReturn && !restorePanel) return;
    const position = timeline.current?.captureReadingPosition();
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const restore = () => {
      if (restorePanel && !restorePanel()) return false;
      if (restorePanel) {
        /* existing history owner restored the pane */
      } else if (previousThread) onOpenThread(previousThread);
      else onCloseThread();
      cleanup.current?.();
      // Let the existing pane history transition commit before geometry restore.
      let frame = 0;
      let attempts = 0;
      const restoreWhenMounted = () => {
        if (++attempts > 30) return;
        if (!timeline.current) {
          frame = requestAnimationFrame(restoreWhenMounted);
          return;
        }
        cleanup.current = position
          ? timeline.current.restoreReadingPosition(position)
          : undefined;
        const target = focused?.isConnected
          ? focused
          : noticeRef.current?.querySelector<HTMLElement>("[data-routed-open]");
        target?.focus({ preventScroll: true });
      };
      frame = requestAnimationFrame(restoreWhenMounted);
      cleanup.current = () => cancelAnimationFrame(frame);
      return true;
    };
    setBack({ channel: channelId, destination: root.id, restore });
    setError("");
    if (onOpenSentReply) onOpenSentReply(root, receipt.messageId);
    else onOpenThread(root);
  };
  const notice = receipt ? (
    <div
      className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs"
      ref={noticeRef}
      data-testid="routed-send-notice"
    >
      <span
        role="status"
        className="min-w-0 flex-1 truncate"
        title={`Sent to ${receipt.title}`}
      >
        Sent to {receipt.title}
      </span>
      <button
        type="button"
        className="min-h-7 shrink-0 rounded px-1 focus-visible:ring-2"
        data-routed-open
        aria-label={`Open thread ${receipt.title}`}
        onClick={open}
      >
        Open
      </button>
      <button
        type="button"
        className="min-h-7 min-w-7 rounded focus-visible:ring-2"
        aria-label="Dismiss sent confirmation"
        onClick={() => {
          if (channelId)
            setReceipts((current) => {
              const next = new Map(current);
              next.delete(channelId);
              return next;
            });
        }}
      >
        ×
      </button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ) : null;
  const backAction =
    back?.channel === channelId && back.destination === previousThread?.id ? (
      <button
        type="button"
        data-testid="routed-send-back"
        className="min-h-7 max-w-48 truncate rounded px-2 text-xs focus-visible:ring-2"
        onClick={() => {
          if (back.restore()) setBack(null);
        }}
      >
        ← Back to #{channelName}
      </button>
    ) : null;
  return { captureSend, notice, backAction };
}

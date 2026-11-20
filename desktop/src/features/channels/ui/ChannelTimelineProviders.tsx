import * as React from "react";
import { InlineAutoExpansionProvider } from "@/features/messages/ui/InlineAutoExpansion";
import type { TimelineMessage } from "@/features/messages/types";
import { TimelineViewContext, useTimelineView } from "./TimelineViewContext";

/** Forward the shared reply-observation callback to each mounted Timeline row. */
export function ChannelTimelineProviders({
  children,
  hidden,
  scope,
  currentPubkey,
  onRepliesRevealed,
}: {
  children: React.ReactNode;
  hidden?: boolean;
  scope: string;
  currentPubkey?: string;
  onRepliesRevealed?: (messages: TimelineMessage[], rootId?: string) => void;
}) {
  const view = useTimelineView();
  const value = React.useMemo(
    () => ({ ...view, onRepliesRevealed }),
    [view, onRepliesRevealed],
  );
  return (
    <TimelineViewContext.Provider value={value}>
      <InlineAutoExpansionProvider scope={scope} currentPubkey={currentPubkey}>
        <div className={hidden ? "hidden" : "contents"}>{children}</div>
      </InlineAutoExpansionProvider>
    </TimelineViewContext.Provider>
  );
}

import type * as React from "react";

import { threadParentQuote } from "@/features/messages/lib/threadParentQuote";
import type { TimelineMessage } from "@/features/messages/types";
import { ThreadParentQuoteChip } from "./ThreadParentQuoteChip";
import { MessageRow } from "./MessageRow";

type MessageThreadRowProps = Omit<
  React.ComponentProps<typeof MessageRow>,
  "layoutVariant"
> & {
  inThreadPanel?: boolean;
  parentMessages?: ReadonlyMap<string, TimelineMessage>;
  onJumpToThreadMessage?: (rootId: string, messageId: string) => void;
};

/** The canonical message-row presentation used inside channel threads. */
export function MessageThreadRow({
  inThreadPanel,
  parentMessages,
  onJumpToThreadMessage,
  ...props
}: MessageThreadRowProps) {
  const quote =
    parentMessages && props.channelId
      ? threadParentQuote(props.message, parentMessages, props.channelId)
      : null;
  // A floating rail can extend above the row and cover its parent quote.
  const hasPanelJump =
    inThreadPanel && onJumpToThreadMessage && quote?.parentLoaded;

  return (
    <>
      {quote && props.channelId ? (
        <ThreadParentQuoteChip
          key="parent-quote"
          channelId={props.channelId}
          quote={quote}
          inThreadPanel={inThreadPanel}
          onJumpToThreadMessage={onJumpToThreadMessage}
        />
      ) : null}
      <MessageRow
        key="message"
        {...props}
        layoutVariant="thread-reply"
        actionBarPlacement={hasPanelJump ? "inside" : props.actionBarPlacement}
      />
    </>
  );
}

import type * as React from "react";

import type { TimelineMessage } from "@/features/messages/types";
import { ThreadParentQuoteChip } from "./ThreadParentQuoteChip";
import { MessageRow } from "./MessageRow";

type MessageThreadRowProps = Omit<
  React.ComponentProps<typeof MessageRow>,
  "layoutVariant"
> & {
  parentMessages?: ReadonlyMap<string, TimelineMessage>;
  onJumpToThreadMessage?: (rootId: string, messageId: string) => void;
};

/** The canonical message-row presentation used inside channel threads. */
export function MessageThreadRow({
  parentMessages,
  onJumpToThreadMessage,
  ...props
}: MessageThreadRowProps) {
  return (
    <>
      {parentMessages && props.channelId ? (
        <ThreadParentQuoteChip
          key="parent-quote"
          channelId={props.channelId}
          message={props.message}
          messages={parentMessages}
          onJumpToThreadMessage={onJumpToThreadMessage}
        />
      ) : null}
      <MessageRow key="message" {...props} layoutVariant="thread-reply" />
    </>
  );
}

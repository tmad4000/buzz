import type * as React from "react";

import type { TimelineMessage } from "@/features/messages/types";
import { ThreadParentQuoteChip } from "./ThreadParentQuoteChip";
import { MessageRow } from "./MessageRow";

type MessageThreadRowProps = Omit<
  React.ComponentProps<typeof MessageRow>,
  "layoutVariant"
> & {
  parentMessages?: ReadonlyMap<string, TimelineMessage>;
};

/** The canonical message-row presentation used inside channel threads. */
export function MessageThreadRow({
  parentMessages,
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
        />
      ) : null}
      <MessageRow key="message" {...props} layoutVariant="thread-reply" />
    </>
  );
}

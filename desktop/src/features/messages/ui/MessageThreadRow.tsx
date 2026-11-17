import { ArchivedReply } from "../archive/ArchiveRun";
import type * as React from "react";

import { MessageRow } from "./MessageRow";

type MessageThreadRowProps = Omit<
  React.ComponentProps<typeof MessageRow>,
  "layoutVariant"
>;

/** The canonical message-row presentation used inside channel threads. */
export function MessageThreadRow(props: MessageThreadRowProps) {
  return (
    <ArchivedReply channelId={props.channelId} message={props.message}>
      <MessageRow {...props} layoutVariant="thread-reply" />
    </ArchivedReply>
  );
}

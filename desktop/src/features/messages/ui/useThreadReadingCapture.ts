import * as React from "react";
import { ThreadViewModeScopeContext } from "@/features/channels/lib/threadViewModePreference";
import { useCaptureConversationReadingPosition } from "@/features/conversations/ConversationReadingPositions";
import { readingPositionKey } from "@/features/conversations/layout/readingPositions";
import type { TimelineMessage } from "@/features/messages/types";

export function useThreadReadingCapture({
  threadHeadId,
  isFocusMode,
  threadBodyRef,
  threadMessages,
  ready,
}: {
  threadHeadId: string | null;
  isFocusMode: boolean | undefined;
  threadBodyRef: React.RefObject<HTMLElement | null>;
  threadMessages: TimelineMessage[];
  ready: boolean;
}) {
  const owner = React.useContext(ThreadViewModeScopeContext);
  const mode = owner?.mode ?? (isFocusMode ? "focus" : "split");
  useCaptureConversationReadingPosition({
    key: threadHeadId ? readingPositionKey("thread", mode, threadHeadId) : null,
    container: threadBodyRef,
    ids: threadMessages.map((message) => message.id),
    ready,
  });
}

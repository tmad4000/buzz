import * as React from "react";
import type { RouterHistory } from "@tanstack/react-router";
import type { MessageComposerProps } from "./MessageComposer.types";
import { useSendScrollReturn } from "./useSendScrollReturn";
import {
  captureReadingPosition,
  restoreReadingPosition,
} from "./timelineReadingPosition";

export function useThreadSendScrollReturn({
  history,
  scope,
  channelId,
  onSend,
  getThread,
}: {
  history?: RouterHistory;
  scope: string | null;
  channelId: string | null;
  onSend: MessageComposerProps["onSend"];
  getThread: () => {
    container: HTMLElement | null;
    ids: string[];
    reveal: (id: string) => void;
    jump: (id: string) => boolean;
  };
}) {
  const [held, setHeld] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<{
    scope: string | null;
    id: string;
  } | null>(null);
  const scroll = useSendScrollReturn({
    history,
    scope,
    getView: () => {
      const { container, ids, jump, reveal } = getThread();
      return {
        container,
        capture: () =>
          container ? captureReadingPosition(container, ids) : null,
        prepare: (id) => {
          if (!id) return;
          setTarget({ scope, id });
          reveal(id);
        },
        jump,
        restore: (position) => {
          if (!container) return;
          if (position.id) setTarget({ scope, id: position.id });
          return restoreReadingPosition(container, position, ids, (id) => {
            setTarget({ scope, id });
            return true;
          });
        },
      };
    },
  });

  const send: MessageComposerProps["onSend"] = async (
    content,
    mentions,
    tags,
    channel,
    context,
    forceRest,
    outbox,
  ) => {
    const attempt =
      !channel || channel === channelId ? scroll.capture() : undefined;
    setHeld(attempt ? scope : null);
    if (!attempt) setTarget(null);
    try {
      const published = await onSend(
        content,
        mentions,
        tags,
        channel,
        attempt && context
          ? { ...context, preserveReadingPosition: true }
          : context,
        forceRest,
        attempt ? attempt.bindOutbox(outbox) : outbox,
      );
      attempt?.published(published?.id);
      return published;
    } catch (error) {
      attempt?.cancel();
      throw error;
    }
  };
  return {
    send,
    notice: scroll.notice,
    holdsPosition: scope !== null && held === scope,
    target: target?.scope === scope ? target.id : null,
  };
}

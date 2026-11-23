import * as React from "react";
import type { TimelineMessage } from "@/features/messages/types";
import type { MessageComposerProps } from "@/features/messages/ui/MessageComposer.types";
import type { MessageTimelineHandle } from "@/features/messages/ui/MessageTimeline";

export type TimelineReplyTarget = {
  id: string;
  rootId: string;
  author: string;
  body: string;
};

const MAX_JUMP_FRAMES = 90;
/** Rows measured after arrival can shift the target, so hold it briefly. */
const SETTLED_JUMP_FRAMES = 12;

/** The scope names one community, identity and channel, like the draft it belongs to. */
export const timelineReplyKey = (scope: string) =>
  `buzz.timelineReply.v1:${scope}`;

/** Presentation text for a quoted message. */
export function quoteExcerpt(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 200) || "Attachment";
}

export function timelineReplyTarget(
  message: TimelineMessage,
): TimelineReplyTarget | null {
  // A row without a relay-accepted ID cannot be a signed reply's parent.
  if (message.pending || message.id.startsWith("outbox-local:")) return null;
  return {
    id: message.id,
    rootId: message.rootId ?? message.id,
    author: message.author,
    body: quoteExcerpt(message.body),
  };
}

export function loadTimelineReply(key: string): TimelineReplyTarget | null {
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(key) ?? "null",
    );
    if (!value || typeof value !== "object") return null;
    const { id, rootId, author, body } = value as Record<string, unknown>;
    return typeof id === "string" &&
      typeof rootId === "string" &&
      typeof author === "string" &&
      typeof body === "string"
      ? { id, rootId, author, body }
      : null;
  } catch {
    return null;
  }
}

function saveTimelineReply(key: string, target: TimelineReplyTarget | null) {
  try {
    if (target) window.localStorage.setItem(key, JSON.stringify(target));
    else window.localStorage.removeItem(key);
  } catch {
    // The mounted composer still shows the target it will use.
  }
}

/**
 * Keeps a reply in the flat Timeline: a quoted parent above the channel
 * composer, sent with the ordinary captured parent/root context.
 *
 * The target is stored beside the channel draft. Without that, leaving and
 * returning would restore the reply's text but send it as a top-level post.
 */
export function useTimelineInPlaceReply({
  channelId,
  flatTimeline,
  onSend,
  scope,
  timelineRef,
}: {
  channelId: string | null;
  flatTimeline: boolean;
  onSend: MessageComposerProps["onSend"];
  scope: string | null;
  timelineRef: React.RefObject<MessageTimelineHandle | null>;
}) {
  const storageKey = scope === null ? null : timelineReplyKey(scope);
  // Keyed so a send that fails after a channel switch restores its own channel.
  const [saved, setSaved] = React.useState<
    Readonly<Record<string, TimelineReplyTarget | null>>
  >({});
  const stored = React.useMemo(
    () => (storageKey ? loadTimelineReply(storageKey) : null),
    [storageKey],
  );
  const target =
    storageKey !== null && storageKey in saved ? saved[storageKey] : stored;
  const current = React.useRef({ key: storageKey, target });
  current.current = { key: storageKey, target };
  const setFor = React.useCallback(
    (key: string, next: TimelineReplyTarget | null) => {
      saveTimelineReply(key, next);
      setSaved((previous) => ({ ...previous, [key]: next }));
      if (current.current.key === key) current.current = { key, target: next };
    },
    [],
  );
  const start = React.useCallback(
    (message: TimelineMessage) => {
      const next = timelineReplyTarget(message);
      if (next && current.current.key) setFor(current.current.key, next);
    },
    [setFor],
  );
  const cancel = React.useCallback(() => {
    if (current.current.key) setFor(current.current.key, null);
  }, [setFor]);

  const jumpFrame = React.useRef(0);
  const stopJump = React.useCallback(() => {
    if (!jumpFrame.current) return;
    cancelAnimationFrame(jumpFrame.current);
    jumpFrame.current = 0;
    timelineRef.current?.prepareSentJump(null);
  }, [timelineRef]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a channel change abandons the old channel's jump.
  React.useEffect(() => stopJump, [channelId, stopJump]);
  /** Scroll to a loaded row and highlight it, without leaving this view. */
  const jump = React.useCallback(
    (id: string, onUnavailable?: () => void) => {
      stopJump();
      timelineRef.current?.prepareSentJump(id);
      let frames = 0;
      let held = 0;
      const step = () => {
        const timeline = timelineRef.current;
        const reached = timeline?.jumpToSentMessage(id) ?? false;
        held = reached ? held + 1 : 0;
        if (
          timeline &&
          held < SETTLED_JUMP_FRAMES &&
          ++frames < MAX_JUMP_FRAMES
        ) {
          jumpFrame.current = requestAnimationFrame(step);
          return;
        }
        stopJump();
        const mounted = timeline
          ?.getReadingContainer()
          ?.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
        if (!reached && !mounted) onUnavailable?.();
      };
      jumpFrame.current = requestAnimationFrame(step);
    },
    [stopJump, timelineRef],
  );

  const captureContext = React.useCallback(() => {
    const reply = current.current.target;
    return reply
      ? { parentEventId: reply.id, threadHeadId: reply.rootId }
      : null;
  }, []);
  const send = React.useCallback<MessageComposerProps["onSend"]>(
    async (
      content,
      mentions,
      tags,
      targetChannel,
      context,
      forceRest,
      outbox,
    ) => {
      const { key, target: reply } = current.current;
      if (!key || !reply || context?.parentEventId !== reply.id)
        return onSend(
          content,
          mentions,
          tags,
          targetChannel,
          context,
          forceRest,
          outbox,
        );
      // Adding people to a DM moves the send to another channel, where this
      // parent does not exist. Fail visibly; the composer restores the draft.
      if (targetChannel && targetChannel !== channelId)
        throw new Error(
          "This reply belongs to the current conversation. Cancel the reply to message the new group.",
        );
      setFor(key, null);
      const reading = { ...context, inTimeline: flatTimeline };
      try {
        return await onSend(
          content,
          mentions,
          tags,
          targetChannel,
          reading,
          forceRest,
          outbox,
        );
      } catch (error) {
        // The composer restores the text; restore the parent it replies to
        // unless the user has already chosen another one.
        if (!loadTimelineReply(key)) setFor(key, reply);
        throw error;
      }
    },
    [channelId, flatTimeline, onSend, setFor],
  );

  const composerTarget = React.useMemo(
    () => (target ? { ...target, onOpen: () => jump(target.id) } : null),
    [target, jump],
  );
  return {
    composerProps: {
      onCancelReply: cancel,
      onCaptureSendContext: captureContext,
      onSend: send,
      replyTarget: composerTarget,
      typingParentEventId: target?.id,
      typingRootEventId: target?.rootId,
    },
    jump,
    start,
  };
}

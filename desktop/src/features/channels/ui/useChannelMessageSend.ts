import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import type { useAppNavigation } from "@/app/navigation/useAppNavigation";
import type { MessageTimelineHandle } from "@/features/messages/ui/MessageTimeline";
import { useSendScrollReturn } from "@/features/messages/ui/useSendScrollReturn";
import type { ChannelPaneProps } from "./ChannelPane.types";
import { containsWelcomePersonaMention } from "./WelcomeComposerBanner";
import { mentionsKnownAgent } from "./ChannelPane.helpers";

export function useChannelMessageSend({
  activeChannelId,
  activeChannelIdRef,
  channelPaneMountedRef,
  completeWelcomeComposerBanner,
  currentPubkey,
  goChannel,
  isActiveWelcomeChannel,
  knownAgentPubkeys,
  messageTimelineRef,
  onSendMessage,
  onSendInlineThreadReply,
}: {
  activeChannelId: string | null;
  activeChannelIdRef: React.RefObject<string | null>;
  channelPaneMountedRef: React.RefObject<boolean>;
  completeWelcomeComposerBanner: () => void;
  currentPubkey?: string;
  goChannel: ReturnType<typeof useAppNavigation>["goChannel"];
  isActiveWelcomeChannel: boolean;
  knownAgentPubkeys: ReadonlySet<string>;
  messageTimelineRef: React.RefObject<MessageTimelineHandle | null>;
  onSendMessage: ChannelPaneProps["onSendMessage"];
  onSendInlineThreadReply: ChannelPaneProps["onSendInlineThreadReply"];
}) {
  const { history } = useRouter();
  const { capture: captureScrollSend, notice: scrollSendNotice } =
    useSendScrollReturn({
      history,
      scope:
        currentPubkey && activeChannelId
          ? JSON.stringify([currentPubkey, activeChannelId])
          : null,
      getView: () => ({
        container: messageTimelineRef.current?.getReadingContainer() ?? null,
        capture: () =>
          messageTimelineRef.current?.captureReadingPosition() ?? null,
        prepare: (id) => messageTimelineRef.current?.prepareSentJump(id),
        jump: (id) =>
          messageTimelineRef.current?.jumpToSentMessage(id) ?? false,
        restore: (position) =>
          messageTimelineRef.current?.restoreReadingPosition(position),
      }),
    });
  const handleSendMessage = React.useCallback(
    async (
      content: string,
      mentionPubkeys: string[],
      mediaTags?: string[][],
      channelId?: string | null,
      threadContext?: {
        parentEventId: string | null;
        threadHeadId: string | null;
        /** The reply renders in this flat view, so own-send scrolling applies. */
        inTimeline?: boolean;
      } | null,
      forceRest?: boolean,
      outbox?: import("@/features/messages/outbox/types").OutboxSubmission,
    ) => {
      const shouldCompleteWelcomeBanner =
        isActiveWelcomeChannel &&
        (containsWelcomePersonaMention(content) ||
          mentionsKnownAgent(mentionPubkeys, knownAgentPubkeys));
      const rendersHere =
        !threadContext?.parentEventId || threadContext.inTimeline === true;
      const attempt =
        rendersHere && (!channelId || channelId === activeChannelId)
          ? captureScrollSend()
          : undefined;
      if (!attempt && rendersHere)
        messageTimelineRef.current?.scrollToBottomOnNextUpdate();
      const published = await onSendMessage(
        content,
        mentionPubkeys,
        mediaTags,
        channelId,
        threadContext,
        forceRest,
        attempt ? attempt.bindOutbox(outbox) : outbox,
      ).catch((error: unknown) => {
        attempt?.cancel();
        throw error;
      });
      attempt?.published(published?.id);
      if (
        channelId &&
        channelId !== activeChannelId &&
        channelPaneMountedRef.current &&
        activeChannelIdRef.current === activeChannelId
      ) {
        await goChannel(channelId, { replace: true });
      }
      if (shouldCompleteWelcomeBanner) {
        completeWelcomeComposerBanner();
      }
      return published;
    },
    [
      activeChannelId,
      activeChannelIdRef,
      captureScrollSend,
      channelPaneMountedRef,
      completeWelcomeComposerBanner,
      goChannel,
      isActiveWelcomeChannel,
      knownAgentPubkeys,
      messageTimelineRef,
      onSendMessage,
    ],
  );
  const handleInlineSend: ChannelPaneProps["onSendInlineThreadReply"] = async (
    content,
    mentions,
    tags,
    channel,
    context,
    forceRest,
    outbox,
  ) => {
    const attempt =
      channel === activeChannelId ? captureScrollSend() : undefined;
    try {
      const published = await onSendInlineThreadReply(
        content,
        mentions,
        tags,
        channel,
        context,
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
  return { history, handleSendMessage, handleInlineSend, scrollSendNotice };
}

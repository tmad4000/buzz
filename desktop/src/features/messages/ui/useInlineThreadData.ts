import { buildThreadPanelIndex } from "../lib/threadPanel";
import * as React from "react";
import type { InlineChannelThreadProps } from "@/features/channels/ui/InlineChannelThread";
import { useChannelMembersQuery } from "@/features/channels/hooks";
import { useMessageEventProfilePubkeys } from "@/features/channels/useMessageEventProfilePubkeys";
import { useRelaySelfQuery } from "@/features/moderation/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import type { RelayEvent } from "@/shared/api/types";
import { formatTimelineMessages } from "../lib/formatTimelineMessages";
import { sortMessages } from "../lib/messageQueryKeys";
import {
  smartThreadDecision,
  type ThreadDisplayPolicy,
} from "../lib/threadDisplayPolicy";
import { useInlineThreadWindow } from "./useInlineThreadWindow";
import { useUnreadSidebarThread } from "./useUnreadSidebarThread";
const EMPTY_EVENTS: RelayEvent[] = [];
export function useInlineThreadData(
  props: InlineChannelThreadProps,
  enabled: boolean,
  scope: string,
  policy: ThreadDisplayPolicy,
) {
  const {
    channel,
    root,
    currentPubkey,
    profiles,
    ownerProfiles,
    personaLookup,
    respondToLookup,
    summary,
    isUnread,
  } = props;
  const canonicalRoot = root.rootId ?? root.id;
  const query = useInlineThreadWindow(
    channel.id,
    canonicalRoot,
    enabled,
    scope,
    `${summary.replyCount}:${summary.lastReplyAt}`,
    summary.replyCount,
  );
  const events = React.useMemo(
    () =>
      enabled && query.data
        ? sortMessages(query.data.pages.flatMap((page) => page.events))
        : EMPTY_EVENTS,
    [enabled, query.data],
  );
  const relaySelf = useRelaySelfQuery(enabled).data;
  const pubkeys = useMessageEventProfilePubkeys(
    EMPTY_EVENTS,
    events,
    relaySelf,
  );
  const profileQuery = useUsersBatchQuery(pubkeys, { enabled });
  const memberQuery = useChannelMembersQuery(channel.id, enabled);
  const combinedProfiles = React.useMemo(
    () => ({ ...profileQuery.data?.profiles, ...profiles }),
    [profileQuery.data?.profiles, profiles],
  );
  const messages = React.useMemo(
    () => [
      root,
      ...formatTimelineMessages(
        events,
        channel,
        currentPubkey,
        currentPubkey
          ? (combinedProfiles[currentPubkey]?.avatarUrl ?? null)
          : null,
        combinedProfiles,
        memberQuery.data,
        personaLookup,
        respondToLookup,
        relaySelf,
        ownerProfiles,
      ).filter((message) => message.id !== root.id),
    ],
    [
      root,
      events,
      channel,
      currentPubkey,
      combinedProfiles,
      memberQuery.data,
      personaLookup,
      respondToLookup,
      relaySelf,
      ownerProfiles,
    ],
  );
  const index = React.useMemo(
    () => buildThreadPanelIndex(messages),
    [messages],
  );
  const knownCount =
    index.descendantStatsByMessageId.get(root.id)?.descendantCount ?? 0;
  const complete = Boolean(
    query.data && !query.hasNextPage && knownCount >= summary.replyCount,
  );
  const decision = React.useMemo(() => {
    if (!query.data || query.isError) return null;
    const result = smartThreadDecision(
      root,
      messages,
      summary.replyCount,
      currentPubkey,
    );
    return result?.kind === "compact" && !complete ? null : result;
  }, [
    query.data,
    query.isError,
    root,
    messages,
    summary.replyCount,
    currentPubkey,
    complete,
  ]);
  const thread = useUnreadSidebarThread({
    enabled: true,
    channelId: channel.id,
    currentPubkey,
    root: root.id,
    messages,
    isUnread,
    scrollTargetId: null,
    pending: query.isPending || !enabled,
    complete,
    indexOverride: index,
    initialMode: policy.replies,
    autoRevealId: policy.channels === "smart" ? decision?.answerId : undefined,
  });
  return {
    query,
    thread,
    messages,
    combinedProfiles,
    decision,
    canonicalRoot,
    ready:
      query.isError ||
      Boolean(
        query.data &&
          !query.isPending &&
          (!profileQuery.isPending || pubkeys.length === 0),
      ),
    complete,
    missingRange: Boolean(
      query.data && !query.hasNextPage && knownCount < summary.replyCount,
    ),
  };
}

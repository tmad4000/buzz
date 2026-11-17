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
import { ThreadOrganizationContext } from "./ThreadOrganization";
import {
  applyThreadLinkPresentation,
  canonicalThreadRootId,
  threadLinkSubtree,
} from "../lib/applyThreadLinkPresentation";
const EMPTY_EVENTS: RelayEvent[] = [];
export function useInlineThreadData(
  props: InlineChannelThreadProps,
  enabled: boolean,
  scope: string,
  policy: ThreadDisplayPolicy,
  retainedAnswerId?: string,
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
  const organization =
    React.useContext(ThreadOrganizationContext)?.snapshot ?? null;
  const projected =
    enabled &&
    organization?.projection.scope.channelId === channel.id &&
    organization?.projection.status === "complete" &&
    organization.projection.messages.has(root.id) &&
    organization.projection.heads.size > 0;
  const canonicalRoot = canonicalThreadRootId(root);
  const query = useInlineThreadWindow(
    channel.id,
    canonicalRoot,
    enabled && !projected,
    scope,
    `${summary.replyCount}:${summary.lastReplyAt}`,
    summary.replyCount,
  );
  const events = React.useMemo(
    () =>
      projected
        ? organization.events
        : enabled && query.data
          ? sortMessages(query.data.pages.flatMap((page) => page.events))
          : EMPTY_EVENTS,
    [enabled, query.data, projected, organization],
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
  const messages = React.useMemo(() => {
    const formatted = formatTimelineMessages(
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
    );
    const nativeMessages = projected
      ? formatted
      : [root, ...formatted.filter((message) => message.id !== root.id)];
    return threadLinkSubtree(
      applyThreadLinkPresentation(
        nativeMessages,
        projected ? organization : null,
      ),
      root.id,
    );
  }, [
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
    organization,
    projected,
  ]);
  const index = React.useMemo(
    () => buildThreadPanelIndex(messages),
    [messages],
  );
  const knownCount =
    index.descendantStatsByMessageId.get(root.id)?.descendantCount ?? 0;
  const complete = Boolean(
    projected ||
      (query.data && !query.hasNextPage && knownCount >= summary.replyCount),
  );
  const decision = React.useMemo(() => {
    if ((!projected && !query.data) || (!projected && query.isError))
      return null;
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
    projected,
  ]);
  const thread = useUnreadSidebarThread({
    enabled: true,
    channelId: channel.id,
    currentPubkey,
    root: root.id,
    messages,
    isUnread,
    scrollTargetId: null,
    pending: (!projected && query.isPending) || !enabled,
    complete,
    indexOverride: index,
    initialMode: policy.replies,
    autoRevealId:
      policy.channels === "smart"
        ? (retainedAnswerId ?? decision?.answerId)
        : undefined,
  });
  return {
    query: projected
      ? {
          ...query,
          isPending: false,
          isError: false,
          isFetching: false,
          isFetchingNextPage: false,
          hasNextPage: false,
        }
      : query,
    thread,
    messages,
    combinedProfiles,
    decision,
    canonicalRoot,
    ready:
      (projected && (!profileQuery.isPending || pubkeys.length === 0)) ||
      query.isError ||
      Boolean(
        query.data &&
          !query.isPending &&
          (!profileQuery.isPending || pubkeys.length === 0),
      ),
    complete,
    missingRange: Boolean(
      !projected &&
        query.data &&
        !query.hasNextPage &&
        knownCount < summary.replyCount,
    ),
  };
}

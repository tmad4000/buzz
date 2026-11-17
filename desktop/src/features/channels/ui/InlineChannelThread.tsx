import * as React from "react";
import { PanelRight } from "lucide-react";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import { useChannelMembersQuery } from "@/features/channels/hooks";
import { useMessageEventProfilePubkeys } from "@/features/channels/useMessageEventProfilePubkeys";
import { useRelaySelfQuery } from "@/features/moderation/hooks";
import { useUsersBatchQuery } from "@/features/profile/hooks";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import { formatTimelineMessages } from "@/features/messages/lib/formatTimelineMessages";
import {
  buildThreadPanelIndex,
  buildThreadPanelDataFromIndex,
  type TimelineThreadSummary,
} from "@/features/messages/lib/threadPanel";
import {
  loadThreadExpansion,
  saveThreadExpansion,
  threadExpansionKey,
} from "@/features/messages/lib/threadExpansionStorage";
import { sidebarVisualMessage } from "@/features/messages/lib/unreadSidebar";
import { THREAD_REPLY_ROW_MARGIN_INLINE_REM } from "@/features/messages/lib/threadTreeLayout";
import type { TimelineMessage } from "@/features/messages/types";
import { useThreadReplies } from "@/features/messages/useThreadReplies";
import { MessageComposer } from "@/features/messages/ui/MessageComposer";
import type { MessageComposerProps } from "@/features/messages/ui/MessageComposer.types";
import { MessageThreadRow } from "@/features/messages/ui/MessageThreadRow";
import { MessageThreadSummaryRow } from "@/features/messages/ui/MessageThreadSummaryRow";
import { ThreadRepliesErrorCard } from "@/features/messages/ui/MessageThreadReplyState";
import type { Channel, RelayEvent, RespondToMode } from "@/shared/api/types";

const EMPTY_EVENTS: RelayEvent[] = [];
type Props = {
  channel: Channel;
  currentPubkey?: string;
  root: TimelineMessage;
  summary: TimelineThreadSummary;
  unreadCount?: number;
  profiles?: UserProfileLookup;
  ownerProfiles?: UserProfileLookup;
  personaLookup?: Map<string, string>;
  respondToLookup?: Map<string, RespondToMode>;
  disabled: boolean;
  isSending: boolean;
  onOpenThread: (message: TimelineMessage) => void;
  onSend: MessageComposerProps["onSend"];
  onToggleReaction?: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  onRepliesRevealed?: (messages: TimelineMessage[], rootId?: string) => void;
};

/** A separate view namespace shares PR4's validated, quota-aware snapshots. */
export function InlineChannelThread(props: Props) {
  const community = React.useMemo(loadActiveCommunityId, []);
  const key = `${threadExpansionKey(community, props.currentPubkey, props.channel.id, props.root.id)}:inline`;
  // Remount on a scope change: abandoned renders cannot write another thread.
  return <ScopedInlineThread key={key} {...props} storageKey={key} />;
}

function ScopedInlineThread(props: Props & { storageKey: string }) {
  const { root, summary, unreadCount, onOpenThread, storageKey } = props;
  const [expanded, setExpanded] = React.useState(
    () => loadThreadExpansion(storageKey).get(root.id) ?? false,
  );
  const regionId = React.useId();
  const toggle = () => {
    const next = !expanded;
    saveThreadExpansion(storageKey, new Map([[root.id, next]]));
    setExpanded(next);
  };
  return (
    <>
      <div className="flex items-center gap-1">
        <MessageThreadSummaryRow
          message={root}
          summary={summary}
          unreadCount={unreadCount}
          showDepthGuides={false}
          summaryIndentOffsetRem={-THREAD_REPLY_ROW_MARGIN_INLINE_REM}
          expanded={expanded}
          controlsId={regionId}
          onOpenThread={toggle}
        />
        <button
          type="button"
          className="mb-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open thread in side panel"
          title="Open thread in side panel"
          data-testid="open-thread-side-panel"
          data-thread-head-id={root.id}
          onClick={() => onOpenThread(root)}
        >
          <PanelRight className="size-3.5" aria-hidden />
        </button>
      </div>
      {expanded ? (
        <section
          id={regionId}
          aria-label={`Inline replies to ${root.author}`}
          data-testid="inline-thread"
          data-thread-head-id={root.id}
          className="mb-3 ml-10 min-w-0 border-l border-border/60 pl-2"
        >
          <InlineThreadContent {...props} />
        </section>
      ) : null}
    </>
  );
}

function InlineThreadContent({
  channel,
  root,
  currentPubkey,
  profiles,
  ownerProfiles,
  personaLookup,
  respondToLookup,
  disabled,
  isSending,
  onSend,
  onToggleReaction,
  onRepliesRevealed,
  storageKey,
}: Props & { storageKey: string }) {
  const canonicalRoot = root.rootId ?? root.id;
  const query = useThreadReplies(channel, canonicalRoot);
  const events = query.data ?? EMPTY_EVENTS;
  const relaySelf = useRelaySelfQuery(true).data;
  const pubkeys = useMessageEventProfilePubkeys(
    EMPTY_EVENTS,
    events,
    relaySelf,
  );
  const fetchedProfiles = useUsersBatchQuery(pubkeys).data?.profiles;
  const memberQuery = useChannelMembersQuery(channel.id);
  const combinedProfiles = React.useMemo(
    () => ({ ...fetchedProfiles, ...profiles }),
    [fetchedProfiles, profiles],
  );
  const entries = React.useMemo(() => {
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
    const messages = [
      root,
      ...formatted.filter((message) => message.id !== root.id),
    ];
    const index = buildThreadPanelIndex(messages);
    return buildThreadPanelDataFromIndex(
      index,
      root.id,
      null,
      new Set(messages.map((message) => message.id)),
    ).visibleReplies;
  }, [
    events,
    channel,
    currentPubkey,
    combinedProfiles,
    memberQuery.data,
    personaLookup,
    respondToLookup,
    relaySelf,
    ownerProfiles,
    root,
  ]);
  const [replyTarget, setReplyTarget] = React.useState<TimelineMessage | null>(
    null,
  );
  const [visibleLimit, setVisibleLimit] = React.useState(50);
  const visibleEntries = React.useMemo(
    () => entries.slice(0, visibleLimit),
    [entries, visibleLimit],
  );
  React.useEffect(() => {
    if (!query.isPending && !query.isError)
      onRepliesRevealed?.(
        visibleEntries
          .map((entry) => entry.message)
          .filter((message) => !message.pending),
        canonicalRoot,
      );
  }, [
    visibleEntries,
    query.isPending,
    query.isError,
    onRepliesRevealed,
    canonicalRoot,
  ]);
  return (
    <>
      {query.isPending ? (
        <p role="status" className="px-3 py-3 text-sm text-muted-foreground">
          Loading replies…
        </p>
      ) : query.isError ? (
        <ThreadRepliesErrorCard
          onRetry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <div
          data-testid="inline-thread-replies"
          className="max-sm:[&_[data-testid=message-body]]:pt-4"
        >
          {visibleEntries.map(({ message }) => (
            <MessageThreadRow
              key={message.renderKey ?? message.id}
              channelId={channel.id}
              actionBarPlacement="inside"
              currentPubkey={currentPubkey}
              message={sidebarVisualMessage(message)}
              profiles={combinedProfiles}
              showDepthGuides={false}
              onReply={setReplyTarget}
              onToggleReaction={onToggleReaction}
            />
          ))}
          {entries.length > visibleEntries.length ? (
            <button
              type="button"
              className="mx-3 my-2 text-sm font-medium text-primary hover:underline"
              onClick={() => setVisibleLimit((limit) => limit + 50)}
            >
              Show {Math.min(50, entries.length - visibleEntries.length)} more
              replies
            </button>
          ) : null}
          {entries.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No replies yet.
            </p>
          ) : null}
        </div>
      )}
      <MessageComposer
        channelId={channel.id}
        channelName={channel.name}
        channelType={channel.channelType}
        audienceContext={{ type: "thread", rootTags: root.tags }}
        draftKey={`inline:${storageKey}`}
        disabled={disabled}
        isSending={isSending}
        profiles={combinedProfiles}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        onCaptureSendContext={() => ({
          parentEventId: replyTarget?.id ?? root.id,
          threadHeadId: canonicalRoot,
        })}
        onSend={async (...args) => {
          await onSend(...args);
          setReplyTarget((current) =>
            current?.id === args[4]?.parentEventId ? null : current,
          );
        }}
        placeholder={`Reply in thread to ${root.author}`}
        containerClassName="px-2 pb-2"
        showBackgroundUploadProgress={false}
        typingParentEventId={root.id}
        typingRootEventId={canonicalRoot}
      />
    </>
  );
}

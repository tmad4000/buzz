import { useThreadPendingJump } from "./useThreadPendingJump";
import { useThreadReplyRenderItems } from "./useThreadReplyRenderItems";
import {
  useThreadReadingScroll,
  useThreadReadingVisit,
} from "./useThreadReadingScroll";
import { useAppShell } from "@/app/AppShellContext";
import { useSidebarOpening } from "./useSidebarOpening";
import type { EarlierReplyRun } from "./sidebarOpeningPolicy";
import { useThreadRowWindow } from "./useThreadRowWindow";
import { useVisibleThreadReplies } from "./useVisibleThreadReplies";
import { ThreadWindowRange } from "./ThreadWindowRange";
import { useThreadDisplayPolicy } from "./useThreadDisplayPolicy";
import { sidebarVisualMessage } from "@/features/messages/lib/unreadSidebar";
import {
  getThreadReplyIndentRem,
  THREAD_REPLY_BODY_OFFSET_REM,
} from "@/features/messages/lib/threadTreeLayout";
import { useUnreadSidebarThread } from "./useUnreadSidebarThread";
import { CollapsedThreadSummary } from "./CollapsedThreadSummary";
import { useThreadDisclosureFocus } from "./useThreadDisclosureFocus";
import * as React from "react";
import { ArrowDown } from "lucide-react";

import { HuddleTranscriptIntro } from "@/features/huddle/components/HuddleTranscriptIntro";
import {
  buildThreadSummaryFromVisibleEntries,
  hasNestedThreadBranches,
  type MainTimelineEntry,
} from "@/features/messages/lib/threadPanel";
import type { MessageComposerEditTarget } from "@/features/messages/ui/MessageComposer.types";
import { canManageMessageForCurrentUser } from "@/features/messages/lib/canManageMessage";
import { handleTimelineMentionCopy } from "@/features/messages/lib/timelineMentionCopy";
import type { TimelineMessage } from "@/features/messages/types";
import type { VideoReviewPresentation } from "@/features/messages/lib/videoReviewContext";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { Channel } from "@/shared/api/types";
import type { ThreadPanelLayoutProps } from "@/features/channels/lib/threadPanelLayout";
import { useEscapeKey } from "@/shared/hooks/useEscapeKey";
import { useIsThreadPanelOverlay } from "@/shared/hooks/use-mobile";
import { VideoReviewNavigationProvider } from "@/shared/ui/VideoReviewNavigation";
import { cn } from "@/shared/lib/cn";
import { AuxiliaryPanel } from "@/shared/layout/AuxiliaryPanel";
import { AuxiliaryPanelBody } from "@/shared/layout/AuxiliaryPanel";
import {
  THREAD_PANEL_COLUMN_CLASS,
  THREAD_PANEL_COMPOSER_GUTTER_CLASS,
  THREAD_PANEL_MESSAGE_GUTTER_CLASS,
} from "@/features/messages/lib/messageThreadPanelLayout";
import { Button } from "@/shared/ui/button";
import { Separator } from "@/shared/ui/separator";
import { ComposerActivityAccessory } from "./ComposerActivityAccessory";
import { ComposerDockBackdrop } from "./ComposerDockBackdrop";
import { MessageComposer } from "./MessageComposer";
import {
  MessageThreadPanelHeader,
  ThreadMessageSkeleton,
} from "./MessageThreadPanelSkeleton";
import { MessageThreadRow } from "./MessageThreadRow";
import { MessageThreadSummaryRow } from "./MessageThreadSummaryRow";
import { ThreadReplyRegion } from "./MessageThreadReplyState";
import { TypingIndicatorRow } from "./TypingIndicatorRow";
import { UnreadDivider } from "./UnreadDivider";
import { useStableSendToChannel } from "./useStableSendToChannel";
import { selectDeferredListRenderState } from "@/features/messages/lib/timelineSnapshot";
import { selectThreadRowHighlight } from "@/features/messages/lib/threadReplyHighlight";

type MessageThreadPanelProps = ThreadPanelLayoutProps & {
  channel: Channel | null;
  channelId: string | null;
  channelName: string;
  currentPubkey?: string;
  disabled?: boolean;
  firstUnreadReplyId?: string | null;
  huddleMemberPubkeys?: readonly string[];
  huddleMemberPubkeysPending?: boolean;
  /** Present the huddle's parent-channel thread as a dedicated live chat. */
  isHuddleTranscript?: boolean;
  editTarget?: MessageComposerEditTarget | null;
  isSending: boolean;
  onCancelEdit?: () => void;
  onCancelReply: () => void;
  onClose: () => void;
  onDelete?: (message: TimelineMessage) => void;
  onEdit?: (message: TimelineMessage) => void;
  onEditLastOwnMessage?: () => boolean;
  onEditSave?: (
    content: string,
    mediaTags?: string[][],
    mentionPubkeys?: string[],
  ) => Promise<void>;
  onMarkUnread?: (message: TimelineMessage) => void;
  onMarkRead?: (message: TimelineMessage) => void;
  onExpandReplies: (message: TimelineMessage) => void;
  onScrollTargetResolved: () => void;
  onScrollTargetSettled?: (messageId: string) => void;
  scrollTargetHighlights?: boolean;
  searchMessageId?: string | null;
  searchQuery?: string;
  onSelectReplyTarget: (message: TimelineMessage) => void;
  onSend: (
    content: string,
    mentionPubkeys: string[],
    mediaTags?: string[][],
    channelId?: string | null,
    threadContext?: {
      parentEventId: string | null;
      threadHeadId: string | null;
    } | null,
    forceRest?: boolean,
  ) => Promise<void>;
  onSendToChannel?: (
    message: TimelineMessage,
    threadRoot: TimelineMessage,
    channelId: string,
  ) => Promise<void>;
  onToggleReaction?: (
    message: TimelineMessage,
    emoji: string,
    remove: boolean,
  ) => Promise<void>;
  profiles?: UserProfileLookup;
  recentMentionPubkeys?: readonly string[];
  replyTargetMessage: TimelineMessage | null;
  scrollTargetId: string | null;
  threadHead: TimelineMessage | null;
  threadReplies: MainTimelineEntry[];
  allThreadMessages?: TimelineMessage[];
  onSidebarRepliesRevealed?: (messages: TimelineMessage[]) => void;
  threadRepliesPending?: boolean;
  /** All pages of the independent reply query have settled for this visit. */
  threadRepliesComplete?: boolean;
  /** True when the thread-reply query terminally failed (all retries exhausted). */
  threadRepliesError?: boolean;
  /** Retries the failed thread-reply load; wired to the query's `refetch`. */
  onRetryThreadReplies?: () => void;
  threadUnreadCount?: number;
  threadReplyUnreadCounts?: ReadonlyMap<string, number>;
  threadTypingPubkeys: string[];
  videoReviewPresentation?: VideoReviewPresentation;
  activityAccessoryContent?: React.ReactNode;
  activityAccessoryVisible: boolean;
  widthPx: number;
  isFollowingThread?: boolean;
  isMessageUnreadById?: (messageId: string) => boolean;
  onFollowThread?: () => void;
  onUnfollowThread?: () => void;
  /**
   * When set to `thread:<threadHead.id>`, the thread composer auto-submits
   * once on mount (Send-from-drafts flow). Must be cleared by
   * `onAutoSubmitComplete` before `submitMessage` fires so the param cannot
   * re-trigger on back-navigation.
   */
  autoSendDraftKey?: string | null;
  /** Called when the thread-composer auto-submit fires so the parent can clear the trigger. */
  onAutoSubmitComplete?: () => void;
};

const EMPTY_THREAD_REPLIES: MainTimelineEntry[] = [];
const THREAD_PANEL_SUMMARY_INDENT_OFFSET_REM = 0;

export function MessageThreadPanel({
  channel,
  channelId,
  channelName,
  columnMaxWidthPx,
  currentPubkey,
  disabled = false,
  firstUnreadReplyId,
  huddleMemberPubkeys,
  huddleMemberPubkeysPending = false,
  isHuddleTranscript = false,
  layout = "standalone",
  editTarget,
  enterMotion,
  headerLeading,
  headerTitle,
  headerTitleAriaLabel,
  isSending,
  isFocusMode,
  isSinglePanelView = false,
  isFollowingThread,
  isMessageUnreadById,
  onCancelEdit,
  onCancelReply,
  onClose,
  onHeaderTitleClick,
  onResetWidth,
  onResizeStart,
  onDelete,
  onEdit,
  onEditLastOwnMessage,
  onEditSave,
  onFollowThread,
  onMarkUnread,
  onMarkRead,
  onExpandReplies,
  onScrollTargetResolved,
  onScrollTargetSettled,
  onSelectReplyTarget,
  onSend,
  onSendToChannel,
  onToggleReaction,
  onUnfollowThread,
  profiles,
  recentMentionPubkeys,
  replyTargetMessage,
  scrollTargetId,
  scrollTargetHighlights = true,
  searchMessageId,
  searchQuery,
  threadHead,
  videoReviewPresentation,
  threadReplies,
  allThreadMessages,
  onSidebarRepliesRevealed,
  threadRepliesPending = false,
  threadRepliesComplete = true,
  threadRepliesError = false,
  onRetryThreadReplies,
  threadUnreadCount,
  threadReplyUnreadCounts,
  threadTypingPubkeys,
  activityAccessoryContent,
  activityAccessoryVisible,
  canResetWidth,
  splitPaneClamp,
  showBackButton,
  testId = "message-thread-panel",
  widthPx,
  transparentChrome = false,
  autoSendDraftKey = null,
  onAutoSubmitComplete,
}: MessageThreadPanelProps) {
  const threadBodyRef = React.useRef<HTMLDivElement>(null);
  const threadContentRef = React.useRef<HTMLDivElement>(null);
  const threadComposerWrapperRef = React.useRef<HTMLDivElement>(null);
  const [hoveredCollapseBranchId, setHoveredCollapseBranchId] = React.useState<
    string | null
  >(null);
  const [collapsedThreadHeadId, setCollapsedThreadHeadId] = React.useState<
    string | null
  >(null);
  const isOverlay = useIsThreadPanelOverlay();
  const threadHeadId = threadHead?.id ?? null;
  const reading = useThreadReadingVisit(
    threadHeadId,
    isFocusMode,
    !isHuddleTranscript,
  );
  useEscapeKey(
    onClose,
    !isHuddleTranscript && (isOverlay || isSinglePanelView || isFocusMode),
  );
  const hasConstrainedColumn = columnMaxWidthPx != null;
  // Whether the composer dock trades its quiet-state spacer for the
  // conditional activity accessory (agent working and/or someone typing).
  const hasComposerBottomActivity =
    activityAccessoryVisible || threadTypingPubkeys.length > 0;

  // Live ref so onCaptureSendContext can read reply state at submit time
  // (before any async mention-flow awaits change navigation state).
  const replyTargetMessageRef = React.useRef(replyTargetMessage);
  replyTargetMessageRef.current = replyTargetMessage;

  const onCaptureSendContext = React.useCallback(
    () => ({
      parentEventId: replyTargetMessageRef.current?.id ?? threadHeadId,
      threadHeadId,
    }),
    [threadHeadId],
  );

  const composerReplyTarget =
    replyTargetMessage && threadHead && replyTargetMessage.id !== threadHead.id
      ? {
          author: replyTargetMessage.author,
          body: replyTargetMessage.body,
          id: replyTargetMessage.id,
        }
      : null;

  const [pendingJump, setPendingJump] = React.useState<{
    root: string;
    id: string;
  } | null>(null);
  const isSidebar =
    !isHuddleTranscript &&
    !isFocusMode &&
    !isSinglePanelView &&
    allThreadMessages !== undefined;
  const hasStoredDisclosure =
    !isHuddleTranscript && allThreadMessages !== undefined;
  const sidebarVisitScope = `${channelId}:${currentPubkey}:${threadHeadId}`;
  const sidebarVisit = React.useRef({
    scope: sidebarVisitScope,
    enabled: isSidebar,
  });
  if (sidebarVisit.current.scope !== sidebarVisitScope)
    sidebarVisit.current = { scope: sidebarVisitScope, enabled: isSidebar };
  const useOpeningDefaults = sidebarVisit.current.enabled;
  const sidebarMessages = React.useMemo(
    () =>
      allThreadMessages ?? [
        ...(threadHead ? [threadHead] : []),
        ...threadReplies.map((e) => e.message),
      ],
    [allThreadMessages, threadHead, threadReplies],
  );
  const displayPolicy = useThreadDisplayPolicy(
    currentPubkey,
    `${channelId}:${threadHeadId}`,
  );
  const { getThreadReplyObservedAt, threadReplySeenReady } = useAppShell();
  const opening = useSidebarOpening({
    enabled: useOpeningDefaults,
    scope: `${channelId}:${currentPubkey}:${threadHeadId}`,
    root: threadHeadId,
    messages: sidebarMessages,
    reader: currentPubkey,
    ready: threadReplySeenReady,
    complete:
      threadRepliesComplete && !threadRepliesPending && !threadRepliesError,
    seenAt: getThreadReplyObservedAt,
    explicitTarget: scrollTargetId,
  });
  const runRegionId = React.useId();
  const sidebar = useUnreadSidebarThread({
    enabled: hasStoredDisclosure,
    visitOnly: useOpeningDefaults,
    freshRevealIds: opening.fresh,
    initialMode: displayPolicy.replies,
    channelId,
    currentPubkey,
    root: threadHeadId,
    pending: threadRepliesPending || threadRepliesError,
    messages: sidebarMessages,
    isUnread: isMessageUnreadById,
    scrollTargetId,
  });
  const {
    expanded: sidebarExpanded,
    newIds,
    toggle: toggleSidebarBranch,
  } = sidebar;
  useThreadDisclosureFocus({
    scope: `${channelId}:${currentPubkey}:${threadHeadId}`,
    root: hasStoredDisclosure ? threadHeadId : null,
    regions: [threadBodyRef],
    messages: sidebar.index.messageById,
    expanded: sidebarExpanded,
  });
  const collapseThreadHeadReplies = React.useCallback(() => {
    if (!threadHeadId) {
      return;
    }

    setHoveredCollapseBranchId(null);
    if (hasStoredDisclosure) sidebar.setExpanded(threadHeadId, false);
    else setCollapsedThreadHeadId(threadHeadId);
  }, [threadHeadId, hasStoredDisclosure, sidebar.setExpanded]);
  const expandThreadHeadReplies = React.useCallback(() => {
    setHoveredCollapseBranchId(null);
    if (hasStoredDisclosure && threadHeadId)
      sidebar.setExpanded(threadHeadId, true);
    else setCollapsedThreadHeadId(null);
  }, [hasStoredDisclosure, threadHeadId, sidebar.setExpanded]);
  const handleCollapseBranchHoverChange = React.useCallback(
    (message: TimelineMessage, hovered: boolean) => {
      setHoveredCollapseBranchId((current) => {
        if (hovered) {
          return message.id;
        }

        return current === message.id ? null : current;
      });
    },
    [],
  );
  const handleCollapseDepthGuide = React.useCallback(
    (message: TimelineMessage) => {
      if (hasStoredDisclosure) {
        sidebar.setExpanded(message.id, false);
        return;
      }
      if (message.id === threadHeadId) {
        collapseThreadHeadReplies();
        return;
      }

      onExpandReplies(message);
    },
    [
      collapseThreadHeadReplies,
      onExpandReplies,
      threadHeadId,
      hasStoredDisclosure,
      sidebar.setExpanded,
    ],
  );

  const runProjection = opening.project(sidebar.entries);
  const effectiveReplies = hasStoredDisclosure
    ? runProjection.entries
    : threadReplies;
  const initialPositionTarget =
    scrollTargetId ?? (reading.saved ? null : opening.openingTarget);
  const rowWindow = useThreadRowWindow(
    effectiveReplies,
    `${channelId}:${currentPubkey}:${threadHeadId}`,
    hasStoredDisclosure && !useOpeningDefaults,
    threadRepliesPending,
    opening.firstUnseen ?? sidebar.firstNewId,
    pendingJump?.root === threadHeadId
      ? pendingJump.id
      : (initialPositionTarget ?? sidebar.ownSendTargetId ?? null),
  );

  const deferredThreadReplies = React.useDeferredValue(
    rowWindow.entries,
    EMPTY_THREAD_REPLIES,
  );
  const isRepliesPending = deferredThreadReplies !== rowWindow.entries;
  const scrollTargetIsVisibleReply = React.useMemo(
    () =>
      scrollTargetId !== null &&
      scrollTargetId !== threadHeadId &&
      deferredThreadReplies.some(
        (entry) => entry.message.id === scrollTargetId,
      ),
    [deferredThreadReplies, scrollTargetId, threadHeadId],
  );
  const isThreadHeadRepliesCollapsed = hasStoredDisclosure
    ? !sidebarExpanded.has(threadHeadId ?? "")
    : collapsedThreadHeadId === threadHeadId && !scrollTargetIsVisibleReply;

  const visibleReadRows = React.useMemo(
    () =>
      !isThreadHeadRepliesCollapsed &&
      !isRepliesPending &&
      !threadRepliesPending &&
      !threadRepliesError
        ? deferredThreadReplies
            .filter((entry) => !runProjection.runs.has(entry.message.id))
            .map((entry) => entry.message)
        : EMPTY_THREAD_REPLIES.map((entry) => entry.message),
    [
      isThreadHeadRepliesCollapsed,
      isRepliesPending,
      threadRepliesPending,
      threadRepliesError,
      deferredThreadReplies,
      runProjection.runs,
    ],
  );
  useVisibleThreadReplies(
    threadBodyRef,
    visibleReadRows,
    onSidebarRepliesRevealed,
    threadHeadId ?? "",
    `${channelId}:${currentPubkey}:${threadHeadId}`,
  );
  React.useLayoutEffect(() => {
    if (scrollTargetIsVisibleReply && collapsedThreadHeadId === threadHeadId) {
      setCollapsedThreadHeadId(null);
    }
  }, [collapsedThreadHeadId, scrollTargetIsVisibleReply, threadHeadId]);

  // Which of the three states the reply region paints this frame. Delegated to
  // a pure helper so the "don't flash empty over an incoming list" rule is
  // covered in the lib test suite (see selectDeferredListRenderState).
  const repliesRenderState = selectDeferredListRenderState(
    deferredThreadReplies.length,
    threadReplies.length,
  );
  const threadHeadSummary = React.useMemo(() => {
    if (!threadHeadId) {
      return null;
    }

    return buildThreadSummaryFromVisibleEntries(threadHeadId, effectiveReplies);
  }, [effectiveReplies, threadHeadId]);
  const visibleThreadHeadSummary = isThreadHeadRepliesCollapsed
    ? threadHeadSummary
    : null;
  // Focus mode gives the thread a subject/body structure: the head is what the
  // thread is about, the replies are the conversation about it. Only draw the
  // rule when there is actually conversation under it — the "no replies yet"
  // card and the streaming-in `pending` state would both leave a rule hanging
  // over an empty region or a placeholder.
  const showThreadHeadDivider =
    !isHuddleTranscript &&
    isFocusMode &&
    (threadRepliesPending || repliesRenderState === "list");

  const threadMessages = React.useMemo(
    () => deferredThreadReplies.map((entry) => entry.message),
    [deferredThreadReplies],
  );
  const shouldShowThreadBranchGuides = React.useMemo(
    () => !isSidebar && hasNestedThreadBranches(deferredThreadReplies),
    [deferredThreadReplies, isSidebar],
  );
  const { highlightedBranch, threadReplyRenderItems } =
    useThreadReplyRenderItems({
      deferredThreadReplies,
      firstUnreadReplyId,
      hoveredCollapseBranchId,
      isHuddleTranscript,
      isSidebar,
      threadHead,
      threadHeadId,
    });

  const threadViewportPending =
    threadRepliesPending ||
    !opening.readyToPosition ||
    repliesRenderState === "pending";
  const { isAtBottom, newMessageCount, onScroll, scrollToBottom } =
    useThreadReadingScroll(
      {
        channelId: threadHeadId,
        contentRef: threadContentRef,
        isLoading: threadViewportPending,
        messages: threadMessages,
        highlightTargetMessage: scrollTargetHighlights,
        onTargetReached: () => {
          opening.positionDone();
          if (scrollTargetId) onScrollTargetResolved();
        },
        onTargetSettled: onScrollTargetSettled,
        pinTargetCentered: !scrollTargetHighlights,
        scrollContainerRef: threadBodyRef,
        targetMessageId: initialPositionTarget,
      },
      {
        reading,
        projectedEntries: effectiveReplies,
        ensureVisible: rowWindow.ensureVisible,
        explicitTargetKey:
          scrollTargetId ??
          searchMessageId ??
          (pendingJump?.root === threadHeadId ? pendingJump.id : null) ??
          sidebar.ownSendTargetId ??
          null,
        ready: !isHuddleTranscript && !threadViewportPending,
        composerRef: threadComposerWrapperRef,
        paddingResetKey: isSinglePanelView,
      },
    );
  const stableSendToChannel = useStableSendToChannel(
    channelId,
    threadHead,
    onSendToChannel,
  );
  useThreadPendingJump({
    pendingJump,
    root: threadHeadId,
    container: threadBodyRef,
    rows: deferredThreadReplies,
    collapsed: isThreadHeadRepliesCollapsed,
    pending: threadRepliesPending,
    error: threadRepliesError,
    resolved: () => setPendingJump(null),
  });
  if (!threadHead) {
    return null;
  }
  const toggleEarlierRun = (run: EarlierReplyRun, open: boolean) => {
    const id = `${runRegionId}-toggle-${run.id}`;
    const button = document.getElementById(id);
    const container = threadBodyRef.current;
    const offset =
      button && container
        ? button.getBoundingClientRect().top -
          container.getBoundingClientRect().top
        : 0;
    if (open) opening.showRun(run);
    else opening.hideRun(run);
    requestAnimationFrame(() => {
      const next = document.getElementById(id);
      if (next && container?.isConnected) {
        container.scrollTop +=
          next.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          offset;
        next.focus({ preventScroll: true });
      }
    });
  };
  const compactSummary = (
    message: TimelineMessage,
    summary: NonNullable<MainTimelineEntry["summary"]>,
  ) => (
    <CollapsedThreadSummary
      message={message}
      summary={summary}
      latestAuthor={
        sidebar.index.descendantStatsByMessageId.get(message.id)
          ?.recentParticipantsNewestFirst[0]?.author
      }
      onToggle={toggleSidebarBranch}
    />
  );
  const firstNewId = sidebar.firstNewId;
  const jumpToUnread = () => {
    if (!firstNewId || !threadHeadId) return;
    sidebar.reveal(firstNewId);
    setPendingJump({ root: threadHeadId, id: firstNewId });
  };
  const threadScrollRegion = (
    <AuxiliaryPanelBody
      className="overflow-y-auto overflow-x-hidden overscroll-contain pb-24"
      data-buzz-conversation-scroll
      data-testid="message-thread-body"
      mode={isHuddleTranscript ? "panel" : undefined}
      onFocusCapture={(event) => {
        const id = (event.target as HTMLElement).closest<HTMLElement>(
          "[data-message-id]",
        )?.dataset.messageId;
        if (id) opening.retain(id);
      }}
      onCopy={handleTimelineMentionCopy}
      onScroll={onScroll}
      tabIndex={-1}
      ref={threadBodyRef}
    >
      {/* The gallery is intentionally DOM-scoped: only media currently rendered
          in this open thread participates. Collapsed or unloaded descendants
          join only after the thread UI renders them. */}
      <div
        className={cn(hasConstrainedColumn && THREAD_PANEL_COLUMN_CLASS)}
        data-image-gallery-scope="thread"
        ref={threadContentRef}
        style={
          hasConstrainedColumn ? { maxWidth: columnMaxWidthPx } : undefined
        }
      >
        {isHuddleTranscript ? (
          <div className={cn(THREAD_PANEL_MESSAGE_GUTTER_CLASS, "pb-2 pt-4")}>
            <HuddleTranscriptIntro />
          </div>
        ) : (
          <div
            className={cn(THREAD_PANEL_MESSAGE_GUTTER_CLASS, "pb-1 pt-0")}
            data-testid="message-thread-head"
          >
            <div className="rounded-2xl">
              <MessageThreadRow
                actionBarPlacement="inside"
                channelId={channelId}
                currentPubkey={currentPubkey}
                huddleMemberPubkeys={huddleMemberPubkeys}
                huddleMemberPubkeysPending={huddleMemberPubkeysPending}
                isFollowingThread={isFollowingThread}
                isUnread={isMessageUnreadById?.(threadHead.id)}
                message={threadHead}
                onDelete={
                  onDelete &&
                  canManageMessageForCurrentUser(
                    threadHead,
                    currentPubkey,
                    profiles,
                  )
                    ? onDelete
                    : undefined
                }
                onEdit={
                  onEdit &&
                  canManageMessageForCurrentUser(
                    threadHead,
                    currentPubkey,
                    profiles,
                  )
                    ? onEdit
                    : undefined
                }
                onFollowThread={
                  onFollowThread ? (_msg) => onFollowThread() : undefined
                }
                onMarkUnread={onMarkUnread}
                onMarkRead={onMarkRead}
                onToggleReaction={onToggleReaction}
                onUnfollowThread={
                  onUnfollowThread ? (_msg) => onUnfollowThread() : undefined
                }
                profiles={profiles}
                searchQuery={
                  searchMessageId === threadHead.id ? searchQuery : undefined
                }
                showDepthGuides={shouldShowThreadBranchGuides}
                videoReviewCommentRootId={videoReviewPresentation?.commentRootIdsByMessageId.get(
                  threadHead.id,
                )}
                videoReviewContext={videoReviewPresentation?.contextsByMessageId.get(
                  threadHead.id,
                )}
              />
            </div>
          </div>
        )}

        {hasStoredDisclosure &&
        sidebarExpanded.has(threadHead.id) &&
        deferredThreadReplies.length > 0 ? (
          <button
            type="button"
            aria-expanded="true"
            className="ml-4 h-7 text-xs text-muted-foreground"
            data-thread-head-id={threadHead.id}
            onClick={() => toggleSidebarBranch(threadHead)}
          >
            Hide replies
          </button>
        ) : null}
        {isSidebar && newIds.size > 0 ? (
          <div
            className="sticky top-0 z-20 flex items-center justify-between border-y bg-background px-4 py-2 text-xs"
            data-testid="sidebar-new-marker"
          >
            <span>{newIds.size} new</span>
            <button
              type="button"
              className="font-medium text-primary"
              onClick={jumpToUnread}
            >
              Jump to first unread
            </button>
          </div>
        ) : null}
        {showThreadHeadDivider ? (
          <div
            className={cn(THREAD_PANEL_MESSAGE_GUTTER_CLASS, "pb-3 pt-2")}
            data-testid="message-thread-head-divider"
          >
            <Separator className="bg-border/60" />
          </div>
        ) : null}

        <div
          className={cn(THREAD_PANEL_MESSAGE_GUTTER_CLASS, "pb-3 pt-0")}
          data-testid="message-thread-replies"
        >
          {!isThreadHeadRepliesCollapsed ? (
            <ThreadWindowRange
              direction="earlier"
              count={rowWindow.earlier}
              onShow={rowWindow.showEarlier}
            />
          ) : null}
          <ThreadReplyRegion
            isPending={threadRepliesPending}
            isError={threadRepliesError}
            deferredCount={deferredThreadReplies.length}
            liveCount={threadReplies.length}
            isHuddleTranscript={isHuddleTranscript}
            onRetry={onRetryThreadReplies}
            renderSkeleton={() => (
              <div
                className="space-y-2.5 pt-1"
                data-testid="message-thread-replies-loading"
              >
                <ThreadMessageSkeleton />
                <ThreadMessageSkeleton />
              </div>
            )}
            renderList={() =>
              visibleThreadHeadSummary ? (
                <div
                  className="space-y-0"
                  data-render-pending={isRepliesPending ? "true" : undefined}
                >
                  {isSidebar ? (
                    compactSummary(threadHead, visibleThreadHeadSummary)
                  ) : (
                    <MessageThreadSummaryRow
                      expanded={hasStoredDisclosure ? false : undefined}
                      depth={threadHead.depth}
                      message={threadHead}
                      onOpenThread={expandThreadHeadReplies}
                      summary={visibleThreadHeadSummary}
                      summaryIndentOffsetRem={
                        THREAD_PANEL_SUMMARY_INDENT_OFFSET_REM
                      }
                      unreadCount={threadUnreadCount}
                    />
                  )}
                </div>
              ) : (
                <div
                  className="space-y-0"
                  data-render-pending={isRepliesPending ? "true" : undefined}
                >
                  {threadReplyRenderItems.map((item) => {
                    const {
                      collapseDepthGuideActions,
                      connectsToVisibleChild,
                      continuationDepths,
                      entry,
                      index,
                      isContinuation,
                    } = item;
                    const run = runProjection.runs.get(entry.message.id);
                    const openRun = runProjection.openStarts.get(
                      entry.message.id,
                    );
                    const runControls = (value: EarlierReplyRun) =>
                      value.ids.map((id) => `${runRegionId}-${id}`).join(" ");
                    if (run)
                      return (
                        <React.Fragment key={`earlier-${run.id}`}>
                          <button
                            id={`${runRegionId}-toggle-${run.id}`}
                            type="button"
                            data-testid="sidebar-earlier-run"
                            aria-expanded="false"
                            aria-controls={runControls(run)}
                            className="my-1 min-h-7 rounded px-3 text-xs text-muted-foreground hover:bg-muted focus-visible:ring-2"
                            onClick={() => toggleEarlierRun(run, true)}
                          >
                            {run.ids.length} earlier{" "}
                            {run.ids.length === 1 ? "reply" : "replies"}
                          </button>
                          <div hidden>
                            {run.ids.map((id) => (
                              <span key={id} id={`${runRegionId}-${id}`} />
                            ))}
                          </div>
                        </React.Fragment>
                      );
                    const showUnreadDivider =
                      index > 0 && entry.message.id === firstUnreadReplyId;
                    const highlight = selectThreadRowHighlight({
                      branch: highlightedBranch,
                      index,
                      messageId: entry.message.id,
                      messageDepth: entry.message.depth,
                      showGuides: shouldShowThreadBranchGuides,
                    });
                    return (
                      <div
                        className={cn(
                          "flex flex-col gap-0",
                          entry.summary &&
                            "group/message rounded-2xl px-0 py-0.5 transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
                        )}
                        key={entry.message.renderKey ?? entry.message.id}
                        id={`${runRegionId}-${entry.message.id}`}
                      >
                        {openRun ? (
                          <button
                            type="button"
                            data-testid="sidebar-hide-earlier-run"
                            id={`${runRegionId}-toggle-${openRun.id}`}
                            aria-expanded="true"
                            aria-controls={runControls(openRun)}
                            className="min-h-7 rounded px-3 text-xs text-muted-foreground focus-visible:ring-2"
                            onClick={() => toggleEarlierRun(openRun, false)}
                          >
                            Hide earlier replies
                          </button>
                        ) : null}
                        {showUnreadDivider ? <UnreadDivider /> : null}
                        {isSidebar && entry.message.depth > 2 ? (
                          <div
                            className="min-w-0 pt-2 text-xs text-muted-foreground"
                            style={{
                              marginInlineStart: `${getThreadReplyIndentRem(2) + THREAD_REPLY_BODY_OFFSET_REM}rem`,
                            }}
                            data-testid="sidebar-reply-context"
                          >
                            <span className="inline-block max-w-full truncate rounded-full bg-muted px-2 py-0.5">
                              Replying to{" "}
                              {sidebar.index.messageById.get(
                                entry.message.parentId ?? "",
                              )?.author ?? "earlier reply"}
                            </span>
                          </div>
                        ) : null}
                        <MessageThreadRow
                          channelId={channelId}
                          currentPubkey={currentPubkey}
                          collapseDepthGuideActions={collapseDepthGuideActions}
                          collapseDescendantsLabel="Collapse replies"
                          connectDescendants={
                            shouldShowThreadBranchGuides &&
                            connectsToVisibleChild
                          }
                          depthGuideDepths={
                            shouldShowThreadBranchGuides
                              ? continuationDepths
                              : undefined
                          }
                          highlightDescendantRail={
                            shouldShowThreadBranchGuides &&
                            highlight.isBranchOwner &&
                            connectsToVisibleChild
                          }
                          highlightReplyConnector={
                            shouldShowThreadBranchGuides &&
                            highlight.isDirectChild
                          }
                          highlightThreadLineDepths={highlight.lineDepths}
                          hoverBackground={!entry.summary}
                          huddleMemberPubkeys={huddleMemberPubkeys}
                          huddleMemberPubkeysPending={
                            huddleMemberPubkeysPending
                          }
                          isContinuation={isContinuation}
                          isUnread={isMessageUnreadById?.(entry.message.id)}
                          message={
                            isSidebar
                              ? sidebarVisualMessage(entry.message)
                              : entry.message
                          }
                          onCollapseDepthGuide={handleCollapseDepthGuide}
                          onCollapseDepthGuideHoverChange={
                            handleCollapseBranchHoverChange
                          }
                          onCollapseDescendants={
                            shouldShowThreadBranchGuides &&
                            connectsToVisibleChild &&
                            !entry.summary
                              ? hasStoredDisclosure
                                ? toggleSidebarBranch
                                : onExpandReplies
                              : undefined
                          }
                          onCollapseDescendantsHoverChange={
                            handleCollapseBranchHoverChange
                          }
                          onDelete={
                            onDelete &&
                            canManageMessageForCurrentUser(
                              entry.message,
                              currentPubkey,
                              profiles,
                            )
                              ? onDelete
                              : undefined
                          }
                          onEdit={
                            onEdit &&
                            canManageMessageForCurrentUser(
                              entry.message,
                              currentPubkey,
                              profiles,
                            )
                              ? onEdit
                              : undefined
                          }
                          onMarkUnread={onMarkUnread}
                          onMarkRead={onMarkRead}
                          onReply={onSelectReplyTarget}
                          onSendToChannel={stableSendToChannel}
                          onToggleReaction={onToggleReaction}
                          profiles={profiles}
                          searchQuery={
                            searchMessageId === entry.message.id
                              ? searchQuery
                              : undefined
                          }
                          showDepthGuides={shouldShowThreadBranchGuides}
                          videoReviewCommentRootId={videoReviewPresentation?.commentRootIdsByMessageId.get(
                            entry.message.id,
                          )}
                          videoReviewContext={videoReviewPresentation?.contextsByMessageId.get(
                            entry.message.id,
                          )}
                        />
                        {hasStoredDisclosure &&
                        sidebarExpanded.has(entry.message.id) &&
                        sidebarMessages.some(
                          (m) => m.parentId === entry.message.id,
                        ) ? (
                          <button
                            type="button"
                            aria-expanded="true"
                            data-testid="sidebar-hide-branch"
                            data-thread-head-id={entry.message.id}
                            style={{
                              marginInlineStart: `${getThreadReplyIndentRem(Math.min(2, entry.message.depth)) + THREAD_REPLY_BODY_OFFSET_REM}rem`,
                            }}
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => toggleSidebarBranch(entry.message)}
                          >
                            Hide replies
                          </button>
                        ) : null}
                        {entry.summary ? (
                          isSidebar ? (
                            compactSummary(entry.message, entry.summary)
                          ) : (
                            <MessageThreadSummaryRow
                              expanded={hasStoredDisclosure ? false : undefined}
                              collapseDepthGuideActions={
                                collapseDepthGuideActions
                              }
                              depth={entry.message.depth}
                              depthGuideDepths={
                                shouldShowThreadBranchGuides
                                  ? continuationDepths
                                  : undefined
                              }
                              highlightThreadLineDepths={highlight.lineDepths}
                              message={entry.message}
                              onCollapseDepthGuide={handleCollapseDepthGuide}
                              onCollapseDepthGuideHoverChange={
                                handleCollapseBranchHoverChange
                              }
                              onOpenThread={
                                hasStoredDisclosure
                                  ? toggleSidebarBranch
                                  : onExpandReplies
                              }
                              summary={entry.summary}
                              summaryIndentOffsetRem={
                                THREAD_PANEL_SUMMARY_INDENT_OFFSET_REM
                              }
                              showDepthGuides={shouldShowThreadBranchGuides}
                              unreadCount={threadReplyUnreadCounts?.get(
                                entry.message.id,
                              )}
                            />
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )
            }
          />
          {!isThreadHeadRepliesCollapsed ? (
            <ThreadWindowRange
              direction="later"
              count={rowWindow.later}
              onShow={rowWindow.showLater}
            />
          ) : null}
          {sidebar.preferenceError ? (
            <p role="status" className="px-3 text-xs text-muted-foreground">
              View preference could not be saved; this choice is session-only.
            </p>
          ) : null}
        </div>
      </div>
    </AuxiliaryPanelBody>
  );

  const threadFooter = (
    <>
      {!isAtBottom ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-36 z-50 flex justify-center px-4">
          <Button
            className="pointer-events-auto h-7 min-h-7 gap-1.5 rounded-full border-border/50 bg-background/85 px-2.5 text-2xs font-medium text-muted-foreground shadow-xs backdrop-blur-sm hover:bg-muted/70 hover:text-foreground [&_svg]:size-4"
            data-testid="thread-scroll-to-latest"
            onClick={() => scrollToBottom("smooth")}
            size="sm"
            type="button"
            variant="outline"
          >
            <ArrowDown aria-hidden />
            {newMessageCount > 0
              ? `${newMessageCount} new message${newMessageCount === 1 ? "" : "s"}`
              : "Jump to latest"}
          </Button>
        </div>
      ) : null}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-40 isolate before:absolute before:inset-x-0 before:bottom-0 before:-z-10 before:h-24 before:bg-gradient-to-b before:from-transparent before:to-background before:content-[''] after:absolute after:inset-x-0 after:bottom-0 after:-z-10 after:h-12 after:bg-background after:content-['']"
        data-testid="thread-composer-overlay"
        ref={threadComposerWrapperRef}
      >
        <div
          className={cn(hasConstrainedColumn && THREAD_PANEL_COLUMN_CLASS)}
          style={
            hasConstrainedColumn ? { maxWidth: columnMaxWidthPx } : undefined
          }
        >
          <div
            className={cn(
              "composer-dock composer-overlay-corner-masks relative pointer-events-auto",
              hasComposerBottomActivity && "composer-dock--with-activity",
            )}
          >
            <ComposerDockBackdrop gutterClassName="inset-x-5" />
            <MessageComposer
              compactWhenEmpty={
                hasStoredDisclosure && sidebarMessages.length <= 1
              }
              autoFocus={!useOpeningDefaults}
              audienceContext={{
                type: "thread",
                rootTags: threadHead.tags,
              }}
              channelId={channelId}
              channelName={channelName}
              channelType={channel?.channelType ?? null}
              containerClassName={cn(
                THREAD_PANEL_COMPOSER_GUTTER_CLASS,
                "pb-0",
              )}
              layoutMode="dock"
              disabled={disabled || isSending || !channelId}
              draftKey={`thread:${threadHead.id}`}
              autoSubmitDraftKey={autoSendDraftKey}
              onAutoSubmitComplete={onAutoSubmitComplete}
              editTarget={editTarget}
              isSending={isSending}
              onCancelEdit={onCancelEdit}
              onCancelReply={composerReplyTarget ? onCancelReply : undefined}
              onCaptureSendContext={onCaptureSendContext}
              onEditLastOwnMessage={onEditLastOwnMessage}
              onEditSave={onEditSave}
              onSend={onSend}
              placeholder={
                isHuddleTranscript
                  ? "Message the huddle"
                  : `Reply in thread to ${threadHead.author}`
              }
              profiles={profiles}
              recentMentionPubkeys={recentMentionPubkeys}
              replyTarget={composerReplyTarget}
              typingParentEventId={threadHead.id}
              typingRootEventId={threadHead.rootId}
            />
            {/* The activity accessory is anchored in the dock's reserved bottom
              rail, so fading it cannot change the observed overlay height or
              move the conversation. Its natural content height remains responsive. */}
            <ComposerActivityAccessory
              className={THREAD_PANEL_COMPOSER_GUTTER_CLASS}
              visible={hasComposerBottomActivity}
            >
              <div className="mx-auto flex w-full max-w-4xl items-center gap-2 overflow-visible pl-2">
                {activityAccessoryVisible && activityAccessoryContent ? (
                  <div className="flex min-w-0 flex-1 overflow-visible">
                    {activityAccessoryContent}
                  </div>
                ) : null}
                {threadTypingPubkeys.length > 0 ? (
                  <TypingIndicatorRow
                    channel={channel}
                    className="min-w-0 flex-1 py-0 pl-[calc(0.75rem+1px)] pr-0 sm:pl-[calc(1rem+1px)]"
                    currentPubkey={currentPubkey}
                    profiles={profiles}
                    typingPubkeys={threadTypingPubkeys}
                    variant="activity"
                  />
                ) : null}
              </div>
            </ComposerActivityAccessory>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <VideoReviewNavigationProvider>
      <AuxiliaryPanel
        canResetWidth={canResetWidth}
        className="relative"
        enterMotion={enterMotion ?? !isFocusMode}
        footer={threadFooter}
        header={
          isHuddleTranscript ? undefined : (
            <MessageThreadPanelHeader
              headerLeading={headerLeading}
              headerTitle={headerTitle}
              headerTitleAriaLabel={headerTitleAriaLabel}
              isFocusMode={isFocusMode}
              isSinglePanelView={isSinglePanelView}
              onClose={onClose}
              onHeaderTitleClick={onHeaderTitleClick}
              showBackButton={showBackButton}
            />
          )
        }
        isSinglePanelView={isSinglePanelView}
        layout={layout}
        onClose={onClose}
        onResetWidth={onResetWidth}
        onResizeStart={onResizeStart}
        splitPaneClamp={splitPaneClamp}
        testId={testId}
        transparentChrome={transparentChrome}
        widthPx={widthPx}
      >
        {threadScrollRegion}
      </AuxiliaryPanel>
    </VideoReviewNavigationProvider>
  );
}

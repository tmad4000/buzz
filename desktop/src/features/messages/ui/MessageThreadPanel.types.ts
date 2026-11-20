import type { RouterHistory } from "@tanstack/react-router";
import type * as React from "react";
import type { ThreadPanelLayoutProps } from "@/features/channels/lib/threadPanelLayout";
import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { VideoReviewPresentation } from "@/features/messages/lib/videoReviewContext";
import type { TimelineMessage } from "@/features/messages/types";
import type {
  MessageComposerEditTarget,
  MessageComposerProps,
} from "@/features/messages/ui/MessageComposer.types";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { Channel } from "@/shared/api/types";

export type MessageThreadPanelProps = ThreadPanelLayoutProps & {
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
  onJumpToThreadMessage?: (rootId: string, messageId: string) => void;
  onScrollTargetResolved: () => void;
  onScrollTargetSettled?: (messageId: string) => void;
  scrollTargetHighlights?: boolean;
  searchMessageId?: string | null;
  searchQuery?: string;
  onSelectReplyTarget: (message: TimelineMessage) => void;
  onSend: MessageComposerProps["onSend"];
  sendScrollHistory?: RouterHistory;
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

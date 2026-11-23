import type { ReactNode } from "react";

import type { DraftMentionRef } from "@/features/messages/lib/useDrafts";
import type { ImetaMedia } from "@/features/messages/lib/imetaMediaMarkdown";
import type { MediaUploadController } from "@/features/messages/lib/useMediaUpload";
import type { UserProfileLookup } from "@/features/profile/lib/identity";
import type { ChannelType } from "@/shared/api/types";

export type MessageComposerEditTarget = {
  author: string;
  body: string;
  id: string;
  isThreadReply: boolean;
  /**
   * NIP-92 imeta attachments on the original event, in tag order. Loaded
   * into the composer's pending-imeta state on edit-open so the user sees
   * them as removable thumbnails (just like the send path) and can add
   * more. The submit path emits a fresh full imeta tag set on the edit
   * event; the receiver overlays it.
   */
  imetaMedia?: ImetaMedia[];
  mentionRefs?: DraftMentionRef[];
  unresolvedMentionPubkeys?: string[];
  /** Historical alias candidates, for retention only; never notifying bindings. */
  unresolvedMentionRefs?: DraftMentionRef[];
};

export type MessageComposerProps = {
  audienceContext?: {
    rootTags?: readonly string[][];
    type: "thread";
  } | null;
  channelId?: string | null;
  channelName: string;
  channelType?: ChannelType | null;
  containerClassName?: string;
  /**
   * `dock` delegates backdrop blur and bottom-rail geometry to a surrounding
   * composer dock. `standalone` keeps both concerns inside this component.
   */
  layoutMode?: "dock" | "standalone";
  disabled?: boolean;
  /** Reading previews can mount an editor without taking focus. */
  autoFocus?: boolean;
  draftKey?: string;
  /**
   * When provided, the composer fires `submitMessage` once on mount after
   * the draft matching this key has been loaded into the editor. This powers
   * the "Send message" confirm-dialog flow in the Drafts panel. The callback
   * `onAutoSubmitComplete` must clear the trigger (e.g. remove `?autoSend`
   * from the URL) — it is called synchronously before `submitMessage` fires
   * so the param is gone before any navigation the send might cause.
   *
   * Fires at most once per mount: a stable key value that persists across
   * re-renders does NOT re-fire.
   */
  autoSubmitDraftKey?: string | null;
  /** Called when the auto-submit fires so the parent can clear the trigger. */
  onAutoSubmitComplete?: () => void;
  editTarget?: MessageComposerEditTarget | null;
  isSending?: boolean;
  mediaController?: MediaUploadController;
  /** Reports whether a surrounding drop zone may add an attachment. */
  onAttachmentAcceptanceChange?: (acceptsAttachment: boolean) => void;
  onDeferredEditPendingChange?: (isPending: boolean) => void;
  onCancelEdit?: () => void;
  onCancelReply?: () => void;
  /**
   * Invoked when the user presses ↑ in an empty composer that is not already
   * in edit mode. The owner should locate the most recent message authored by
   * the current user within this composer's scope (main timeline, DM, or
   * thread) and enter edit mode for it. Return `true` if a target was found
   * and edit mode was entered, so the composer can swallow the keystroke;
   * return `false` to let the arrow key fall through normally.
   */
  onEditLastOwnMessage?: () => boolean;
  onEditSave?: (
    content: string,
    mediaTags?: string[][],
    mentionPubkeys?: string[],
    /** Target captured when the edit was submitted; avoids a later ref swap. */
    eventId?: string,
  ) => Promise<void>;
  /** Captures send context synchronously before awaits can change navigation. */
  onCaptureSendContext?: () => {
    parentEventId: string | null;
    threadHeadId: string | null;
    localSendOrigin?: Omit<import("@/shared/api/types").LocalSendIntent, "id">;
  } | null;
  onPrepareSendChannel?: (pubkeys?: string[]) => Promise<string | null>;
  onPreparingMentionSendChange?: (isPreparing: boolean) => void;
  onSend: (
    content: string,
    mentionPubkeys: string[],
    mediaTags?: string[][],
    channelId?: string | null,
    threadContext?: {
      parentEventId: string | null;
      threadHeadId: string | null;
      preserveReadingPosition?: boolean;
      localSendOrigin?: Omit<
        import("@/shared/api/types").LocalSendIntent,
        "id"
      >;
    } | null,
    /** Route through the REST publisher even when best-effort enrichment settled empty. */
    forceRest?: boolean,
    outbox?: import("../outbox/types").OutboxSubmission,
  ) => Promise<void | { id: string }>;
  /** Presentation only: keep the mounted editor compact while empty and fully blurred. */
  compactWhenEmpty?: boolean;
  /** Persistent editor name, independent of its visual placeholder. */
  accessibleLabel?: string;
  placeholder?: string;
  profiles?: UserProfileLookup;
  /** Explicit mention pubkeys from the loaded channel window, newest first. */
  recentMentionPubkeys?: readonly string[];
  replyTarget?: {
    author: string;
    body: string;
    id: string;
    /** Reveal the quoted message from the reply banner. */
    onOpen?: () => void;
  } | null;
  showTopBorder?: boolean;
  /** Render the app-wide upload queue above this composer dock. */
  showBackgroundUploadProgress?: boolean;
  showOutboxRows?: boolean;
  toolbarExtraActions?: ReactNode;
  /** Loaded roots from this pane only; enables explicit routing beside Send. */
  /** Capture an origin-bound observer before the routed-send pipeline awaits. */
  onCaptureRoutedSend?: (
    rootId: string,
  ) => ((messageId?: string) => void) | undefined;
  threadRoutingEntries?: readonly import("../lib/threadPanel").MainTimelineEntry[];
  /** A nested picker only accepts descendants of this head and preserves its canonical root. */
  threadRoutingScope?: import("../lib/threadRouting").ThreadRoutingScope;
  typingParentEventId?: string | null;
  typingRootEventId?: string | null;
};

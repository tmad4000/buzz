import * as React from "react";
import { ThreadViewModeScopeContext } from "@/features/channels/lib/threadViewModePreference";
import {
  useCaptureConversationReadingPosition,
  useInitialConversationReadingPosition,
  useRestoreConversationReadingPosition,
} from "@/features/conversations/ConversationReadingPositions";
import {
  ConversationViewContext,
  useConversationControlScope,
} from "@/features/conversations/ConversationViewContext";
import { readingPositionKey } from "@/features/conversations/layout/readingPositions";
import {
  restoreReadingPosition,
  type TimelineReadingPosition,
  type ReadingRestoreStop,
} from "./timelineReadingPosition";
import { useReadingRestoreAdmission } from "./useReadingRestoreAdmission";
import { useAnchoredScroll } from "./useAnchoredScroll";
import { useComposerHeightPadding } from "./useComposerHeightPadding";

export function useThreadReadingVisit(
  root: string | null,
  focus: boolean | undefined,
  enabled: boolean,
) {
  const owner = React.useContext(ThreadViewModeScopeContext);
  const view = React.useContext(ConversationViewContext);
  const mode = owner?.mode ?? (focus ? "focus" : "split");
  const key =
    enabled && root && view ? readingPositionKey("thread", mode, root) : null;
  const saved = useInitialConversationReadingPosition(key);
  return { key, saved };
}

export function useThreadReadingScroll(
  options: Parameters<typeof useAnchoredScroll>[0],
  {
    reading,
    projectedEntries,
    ensureVisible,
    explicitTargetKey,
    ready,
    composerRef,
    paddingResetKey,
  }: {
    reading: ReturnType<typeof useThreadReadingVisit>;
    projectedEntries: Array<{ message: { id: string } }>;
    ensureVisible: (ids: readonly string[]) => boolean;
    explicitTargetKey: string | null;
    ready: boolean;
    composerRef: React.RefObject<HTMLElement | null>;
    paddingResetKey: unknown;
  },
) {
  const projectedIds = [
    options.channelId,
    ...projectedEntries.map((e) => e.message.id),
  ].filter((id): id is string => id != null);
  const view = React.useContext(ConversationViewContext);
  const { canHandle } = useConversationControlScope();
  const scroll = useAnchoredScroll({
    ...options,
    channelId: reading.key ?? options.channelId,
    deferInitialPosition: reading.saved !== undefined,
  });
  const latest = React.useRef({
    reading,
    projectedIds,
    ensureVisible,
    explicitTargetKey,
    view,
  });
  React.useLayoutEffect(() => {
    latest.current = {
      reading,
      projectedIds,
      ensureVisible,
      explicitTargetKey,
      view,
    };
  });
  const ownerKey =
    view && reading.key
      ? JSON.stringify([
          view.viewInstanceId,
          reading.key,
          view.focused,
          view.visible,
          view.interactive,
          explicitTargetKey,
        ])
      : null;
  const admission = useReadingRestoreAdmission(
    ownerKey,
    options.scrollContainerRef,
    canHandle,
  );
  React.useLayoutEffect(() => {
    if (explicitTargetKey === null || !reading.saved) return;
    // Local search/reveal/send targets may bypass anchored targetMessageId.
    // Consume an unclaimed reservation without issuing another navigation.
    const lease = scroll.beginReadingRestore();
    lease?.release();
  }, [explicitTargetKey, reading.saved, scroll.beginReadingRestore]);
  useCaptureConversationReadingPosition({
    key: reading.key,
    container: options.scrollContainerRef,
    ids: [
      options.channelId,
      ...options.messages.map((message) => message.id),
    ].filter((id): id is string => id != null),
    ready,
  });
  const restore = React.useCallback(
    (
      snapshot: TimelineReadingPosition,
      onStop: (reason: ReadingRestoreStop) => void,
    ) => {
      const element = options.scrollContainerRef.current;
      const eventLease = admission.current?.capture();
      if (!element || !eventLease?.()) return;
      const positioning = scroll.beginReadingRestore();
      if (!positioning) return;
      const key = reading.key;
      const viewId = view?.viewInstanceId;
      const canRestore = () => {
        const current = latest.current;
        return (
          positioning.current() &&
          eventLease() &&
          current.reading.key === key &&
          current.view?.viewInstanceId === viewId &&
          current.explicitTargetKey === null &&
          current.view?.interactive !== false &&
          current.view?.rootRef?.current?.dataset.focusedConversation ===
            "true" &&
          element.isConnected &&
          element.getClientRects().length > 0 &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]')
        );
      };
      if (!canRestore()) {
        positioning.release();
        return;
      }
      const stop = restoreReadingPosition(
        element,
        snapshot,
        latest.current.projectedIds,
        (id) => canRestore() && latest.current.ensureVisible([id]),
        canRestore,
        (reason) => {
          positioning.release();
          onStop(reason);
        },
      );
      return () => {
        stop();
        positioning.release();
      };
    },
    [
      admission,
      options.scrollContainerRef,
      reading.key,
      scroll.beginReadingRestore,
      view?.viewInstanceId,
    ],
  );
  useRestoreConversationReadingPosition({
    key: reading.key ?? "",
    container: options.scrollContainerRef,
    ready: reading.key !== null && ready,
    explicitTarget: explicitTargetKey !== null,
    restore,
  });
  const settlePadding = React.useCallback(() => {
    const handled = scroll.settleAtBottomAfterLayout();
    // A saved-slot owner consumes legacy direct-scroll fallback as well.
    return reading.saved !== undefined || handled;
  }, [reading.saved, scroll.settleAtBottomAfterLayout]);
  useComposerHeightPadding(
    options.scrollContainerRef,
    composerRef,
    paddingResetKey,
    "padding",
    settlePadding,
  );
  return scroll;
}

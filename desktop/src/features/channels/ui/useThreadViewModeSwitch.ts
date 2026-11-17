import * as React from "react";
import { useConversationControlScope } from "@/features/conversations/ConversationViewContext";

import {
  useSetThreadViewMode,
  type ThreadViewMode,
} from "@/features/channels/lib/threadViewModePreference";

export function findTopVisibleThreadMessageId(
  body: HTMLElement | null,
): string | null {
  if (!body) return null;

  const bodyTop = body.getBoundingClientRect().top;
  const visibleReply = Array.from(
    body.querySelectorAll<HTMLElement>("[data-message-id]"),
  ).find((row) => row.getBoundingClientRect().bottom > bodyTop);
  return visibleReply?.dataset.messageId ?? null;
}

export function getResolvedThreadTargets({
  externalTargetId,
  layoutTargetId,
}: {
  externalTargetId: string | null;
  layoutTargetId: string | null;
}) {
  return {
    resolveExternal:
      layoutTargetId === null || layoutTargetId === externalTargetId,
    resolveLayout: layoutTargetId !== null,
  };
}

type LayoutScrollTarget = {
  messageId: string;
  threadHeadId: string;
};

export function getScopedLayoutScrollTargetId({
  activeThreadHeadId,
  layoutTarget,
}: {
  activeThreadHeadId: string | null;
  layoutTarget: LayoutScrollTarget | null;
}): string | null {
  return layoutTarget?.threadHeadId === activeThreadHeadId
    ? layoutTarget.messageId
    : null;
}

type ThreadViewModeSwitchOptions = {
  activeThreadHeadId: string | null;
  externalScrollTargetId: string | null;
  onExternalTargetResolved: () => void;
  onModeChange?: (mode: ThreadViewMode) => void;
};

/** Preserves the reply being read while the thread changes presentation. */
export function useThreadViewModeSwitch({
  activeThreadHeadId,
  externalScrollTargetId,
  onExternalTargetResolved,
  onModeChange,
}: ThreadViewModeSwitchOptions) {
  const { canHandle, query } = useConversationControlScope();
  const setThreadViewMode = useSetThreadViewMode();
  const latestThreadHead = React.useRef(activeThreadHeadId);
  latestThreadHead.current = activeThreadHeadId;
  const focusRequest = React.useRef(0);
  const [layoutScrollTarget, setLayoutScrollTarget] =
    React.useState<LayoutScrollTarget | null>(null);
  const layoutScrollTargetId = getScopedLayoutScrollTargetId({
    activeThreadHeadId,
    layoutTarget: layoutScrollTarget,
  });

  React.useEffect(() => {
    setLayoutScrollTarget((current) =>
      current?.threadHeadId === activeThreadHeadId ? current : null,
    );
  }, [activeThreadHeadId]);

  const changeThreadViewMode = React.useCallback(
    (mode: ThreadViewMode, restoreFocus: boolean) => {
      if (!canHandle()) return;
      const request = ++focusRequest.current;
      const body = query('[data-testid="message-thread-body"]');
      const anchorId = findTopVisibleThreadMessageId(body);

      setLayoutScrollTarget(
        anchorId && activeThreadHeadId
          ? { messageId: anchorId, threadHeadId: activeThreadHeadId }
          : null,
      );
      onModeChange?.(mode);
      setThreadViewMode(mode);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (
            request !== focusRequest.current ||
            latestThreadHead.current !== activeThreadHeadId
          )
            return;
          query(
            restoreFocus
              ? '[data-testid="thread-view-mode-toggle"]'
              : '[data-testid="message-thread-body"]',
          )?.focus({ preventScroll: true });
        });
      });
    },
    [activeThreadHeadId, canHandle, onModeChange, query, setThreadViewMode],
  );

  const resolveScrollTarget = React.useCallback(
    (settledMessageId?: string) => {
      const resolution = getResolvedThreadTargets({
        externalTargetId: externalScrollTargetId,
        layoutTargetId: layoutScrollTargetId,
      });
      if (resolution.resolveExternal) onExternalTargetResolved();
      if (settledMessageId) {
        setLayoutScrollTarget((current) =>
          current?.threadHeadId === activeThreadHeadId &&
          current.messageId === settledMessageId
            ? null
            : current,
        );
      }
    },
    [
      activeThreadHeadId,
      externalScrollTargetId,
      layoutScrollTargetId,
      onExternalTargetResolved,
    ],
  );

  return {
    changeThreadViewMode,
    layoutScrollTargetId,
    resolveScrollTarget,
  };
}

import * as React from "react";
import { ChannelScreen } from "@/features/channels/ui/ChannelScreen";
import type { ChannelScreenProps } from "@/features/channels/ui/ChannelScreen.types";
import {
  ThreadViewModeScopeProvider,
  type ThreadViewMode,
} from "@/features/channels/lib/threadViewModePreference";
import { MainInsetProvider } from "@/shared/layout/MainInsetContext";
import { useElementWidth } from "@/shared/hooks/use-mobile";
import { ThreadPanelWidthScopeProvider } from "@/shared/hooks/useThreadPanelWidth";
import {
  HistorySearchScopeProvider,
  type HistorySearchScope,
  type HistorySearchValues,
} from "@/shared/hooks/HistorySearchScope";
import { ConversationViewContext } from "./ConversationViewContext";
import { ConversationDraftEditorsContext } from "./ConversationDraftEditors";

export type ConversationViewHostProps = {
  viewInstanceId: string;
  focused: boolean;
  visible: boolean;
  label: string;
  initialPanelState?: HistorySearchValues;
  initialThreadViewMode?: ThreadViewMode;
  onThreadViewModeChange?: (mode: ThreadViewMode) => void;
  initialThreadPanelWidthPx?: number;
  onThreadPanelWidthChange?: (width: number) => void;
  onPanelNavigate?: HistorySearchScope["applyPatch"];
  onFocusView: (viewInstanceId: string) => void;
  channel: ChannelScreenProps;
};

/** One presentation instance. Its stable React key must be viewInstanceId, never channelId. */
export function ConversationViewHost({
  viewInstanceId,
  focused,
  visible,
  label,
  initialPanelState,
  initialThreadViewMode,
  onThreadViewModeChange,
  initialThreadPanelWidthPx,
  onThreadPanelWidthChange,
  onPanelNavigate,
  onFocusView,
  channel,
}: ConversationViewHostProps) {
  const coordinator = React.useContext(ConversationDraftEditorsContext);
  if (!coordinator)
    throw new Error(
      "ConversationViewHost requires a shared scoped draft editor provider",
    );
  const [insetRef, contentWidthPx] = useElementWidth<HTMLDivElement>();
  const admission = React.useMemo(
    () => ({
      viewInstanceId,
      focused,
      visible,
      rootRef: insetRef,
      contentWidthPx,
    }),
    [viewInstanceId, focused, visible, insetRef, contentWidthPx],
  );
  const focusView = () => onFocusView(viewInstanceId);
  return (
    <section
      ref={insetRef}
      aria-label={`${label}${focused ? " · Active conversation" : ""}`}
      data-conversation-view={viewInstanceId}
      data-focused-conversation={focused || undefined}
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      hidden={!visible}
      style={{ contain: "layout paint", display: visible ? undefined : "none" }}
      onPointerDownCapture={focusView}
      onFocusCapture={focusView}
    >
      <ConversationViewContext.Provider value={admission}>
        <MainInsetProvider mainInsetRef={insetRef}>
          <ThreadViewModeScopeProvider
            initialMode={initialThreadViewMode}
            onChange={onThreadViewModeChange}
          >
            <ThreadPanelWidthScopeProvider
              initialWidthPx={initialThreadPanelWidthPx}
              onChange={onThreadPanelWidthChange}
            >
              <HistorySearchScopeProvider
                key={channel.activeChannel?.id ?? "unavailable"}
                initialValues={initialPanelState}
                onNavigate={onPanelNavigate}
              >
                <ChannelScreen {...channel} />
              </HistorySearchScopeProvider>
            </ThreadPanelWidthScopeProvider>
          </ThreadViewModeScopeProvider>
        </MainInsetProvider>
      </ConversationViewContext.Provider>
    </section>
  );
}

/** Duplicate only navigable presentation. An automatic send command is never inherited. */
export function duplicatePanelState(
  state: HistorySearchValues,
): HistorySearchValues {
  const { autoSend: _autoSend, ...copy } = state;
  return copy;
}

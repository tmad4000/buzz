import * as React from "react";
import { ChannelScreen } from "@/features/channels/ui/ChannelScreen";
import type { ChannelScreenProps } from "@/features/channels/ui/ChannelScreen.types";
import { MainInsetProvider } from "@/shared/layout/MainInsetContext";
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
  onPanelNavigate,
  onFocusView,
  channel,
}: ConversationViewHostProps) {
  const coordinator = React.useContext(ConversationDraftEditorsContext);
  if (!coordinator)
    throw new Error(
      "ConversationViewHost requires a shared scoped draft editor provider",
    );
  const insetRef = React.useRef<HTMLDivElement>(null);
  const admission = React.useMemo(
    () => ({ viewInstanceId, focused, visible }),
    [viewInstanceId, focused, visible],
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
      style={visible ? undefined : { display: "none" }}
      onPointerDownCapture={focusView}
      onFocusCapture={focusView}
    >
      <ConversationViewContext.Provider value={admission}>
        <MainInsetProvider mainInsetRef={insetRef}>
          <HistorySearchScopeProvider
            initialValues={initialPanelState}
            onNavigate={onPanelNavigate}
          >
            <ChannelScreen {...channel} />
          </HistorySearchScopeProvider>
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

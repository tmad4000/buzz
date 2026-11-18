import * as React from "react";
import { ConversationAutoSubmitCommands } from "./autoSubmitCommands";
import { ConversationDraftEditorsContext } from "./ConversationDraftEditors";
import type { DraftEditorCoordinator } from "./draftEditorCoordinator";
import { listPanes } from "./layout/model";
import type { ConversationWorkspaceSession } from "./useConversationWorkspace";

export type ConversationAutoSubmitScope = {
  commands: ConversationAutoSubmitCommands;
  coordinator: DraftEditorCoordinator;
  scopeKey: string;
  visitForView: (viewId: string) => number | undefined;
};
export const ConversationAutoSubmitContext =
  React.createContext<ConversationAutoSubmitScope | null>(null);

/** Committed command lifetime under the existing draft-owner provider. No issuance or editor takeover. */
export function ConversationAutoSubmitProvider({
  session,
  active,
  isAuthorized,
  scopeRef,
  children,
}: {
  session: ConversationWorkspaceSession;
  active: boolean;
  isAuthorized: (channelId: string) => boolean;
  scopeRef?: React.RefObject<ConversationAutoSubmitScope | null>;
  children: React.ReactNode;
}) {
  const coordinator = React.useContext(ConversationDraftEditorsContext);
  const current = React.useRef({ session, active, isAuthorized });
  current.current = { session, active, isAuthorized };
  const [installed, setInstalled] = React.useState<{
    session: ConversationWorkspaceSession;
    coordinator: DraftEditorCoordinator;
    commands: ConversationAutoSubmitCommands;
  } | null>(null);
  React.useLayoutEffect(() => {
    if (!coordinator) return;
    const { controller } = session;
    const commands = new ConversationAutoSubmitCommands({
      scopeKey: session.scopeKey,
      ownerForDraft: (key) => coordinator.owner(key),
      isCurrent: (target) => {
        if (
          current.current.session !== session ||
          !current.current.active ||
          !current.current.isAuthorized(target.channelId) ||
          document.visibilityState !== "visible" ||
          !document.hasFocus()
        )
          return false;
        const layout = controller.getSnapshot().layout;
        const pane = listPanes(layout.root).find(
          (item) => item.id === layout.focusedPaneId,
        );
        return (
          target.scopeKey === session.scopeKey &&
          pane?.viewInstanceId === target.viewId &&
          layout.views[target.viewId]?.channelId === target.channelId &&
          controller.visitToken(target.viewId) === target.visit
        );
      },
      subscribeInvalidation: (notify) => {
        const stopView = controller.subscribe(notify);
        const stopOwner = coordinator.subscribe(notify);
        return () => {
          stopView();
          stopOwner();
        };
      },
    });
    const retire = () => commands.retireAll();
    window.addEventListener("blur", retire);
    document.addEventListener("visibilitychange", retire);
    setInstalled({ session, coordinator, commands });
    return () => {
      commands.dispose();
      window.removeEventListener("blur", retire);
      document.removeEventListener("visibilitychange", retire);
    };
  }, [session, coordinator]);
  const value = React.useMemo<ConversationAutoSubmitScope | null>(
    () =>
      installed?.session === session && installed.coordinator === coordinator
        ? {
            commands: installed.commands,
            coordinator,
            scopeKey: session.scopeKey,
            visitForView: (id) => session.controller.visitToken(id),
          }
        : null,
    [installed, session, coordinator],
  );
  const observed = React.useRef({ value, active, isAuthorized });
  React.useLayoutEffect(() => {
    const previous = observed.current;
    observed.current = { value, active, isAuthorized };
    if (previous.value !== value || previous.active !== active)
      value?.commands.retireAll();
    else if (previous.isAuthorized !== isAuthorized)
      value?.commands.retireInvalid();
  }, [value, active, isAuthorized]);
  React.useLayoutEffect(() => {
    if (!scopeRef) return;
    scopeRef.current = value;
    return () => {
      if (scopeRef.current === value) scopeRef.current = null;
    };
  }, [scopeRef, value]);
  return (
    <ConversationAutoSubmitContext.Provider value={value}>
      {children}
    </ConversationAutoSubmitContext.Provider>
  );
}

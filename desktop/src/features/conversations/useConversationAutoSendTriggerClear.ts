import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import type { ConversationAutoSubmitTarget } from "./autoSubmitAttempt";
import { clearCapturedAutoSendTrigger } from "./autoSendTriggerClear";
import { listPanes } from "./layout/model";
import { projectionEchoesFor } from "./projectionEchoes";
import { sameConversationPanelRoute } from "./routeProjection";
import type { ConversationWorkspaceSession } from "./useConversationWorkspace";

/** Raw router adapter for a command that already passed target navigation guards.
 * Merely creating this callback never consumes a permit or issues a send. */
export function useConversationAutoSendTriggerClear({
  session,
  active,
}: {
  session: ConversationWorkspaceSession | null;
  active: boolean;
}) {
  const router = useRouter();
  const [echoOwner] = React.useState(() => ({}));
  const mounted = React.useRef(false);
  const lifetime = React.useRef<{
    session: ConversationWorkspaceSession;
    active: boolean;
    controller: AbortController;
  } | null>(null);
  const current = React.useRef({ session, active });
  current.current = { session, active };
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useLayoutEffect(() => {
    if (!session) return;
    const echoes = projectionEchoesFor(session.controller);
    const installed = { session, active, controller: new AbortController() };
    lifetime.current = installed;
    return () => {
      installed.controller.abort();
      if (lifetime.current === installed) lifetime.current = null;
      echoes.cancelOwner(echoOwner);
    };
  }, [session, active, echoOwner]);
  return React.useCallback(
    async (
      entryKey: string,
      target: ConversationAutoSubmitTarget,
      onProjection?: (id: string) => void,
      commandSignal?: AbortSignal,
    ) => {
      const installed = lifetime.current;
      if (
        !session ||
        !installed ||
        installed.session !== session ||
        !installed.active ||
        installed.controller.signal.aborted
      )
        return false;
      const controller = session.controller;
      const view = controller.getSnapshot().layout.views[target.viewId];
      if (!view) return false;
      const admitted = () => {
        if (
          !mounted.current ||
          current.current.session !== session ||
          !current.current.active ||
          target.scopeKey !== session.scopeKey ||
          document.visibilityState !== "visible" ||
          !document.hasFocus()
        )
          return false;
        const layout = controller.getSnapshot().layout;
        const liveView = layout.views[target.viewId];
        return (
          liveView?.channelId === target.channelId &&
          controller.visitToken(target.viewId) === target.visit &&
          sameConversationPanelRoute(liveView.panelState, view.panelState) &&
          listPanes(layout.root).some(
            (pane) =>
              pane.id === layout.focusedPaneId &&
              pane.viewInstanceId === target.viewId,
          )
        );
      };
      if (!admitted()) return false;
      const projectionId = crypto.randomUUID();
      onProjection?.(projectionId);
      return clearCapturedAutoSendTrigger({
        entryKey,
        target,
        view,
        admitted,
        readLocation: () => router.state.location,
        readHistory: () => router.history.location,
        subscribe: (notify) =>
          router.history.subscribe(({ location, action }) =>
            notify(location, action.type),
          ),
        navigate: async (projection) => {
          await router.navigate(projection as never);
        },
        echoes: projectionEchoesFor(controller),
        echoOwner,
        projectionId,
        signal: commandSignal
          ? AbortSignal.any([installed.controller.signal, commandSignal])
          : installed.controller.signal,
      });
    },
    [router, session, echoOwner],
  );
}

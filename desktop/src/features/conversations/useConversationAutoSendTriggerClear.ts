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
    return () => echoes.cancelOwner(echoOwner);
  }, [session, echoOwner]);
  return React.useCallback(
    async (
      entryKey: string,
      target: ConversationAutoSubmitTarget,
      onProjection?: (id: string) => void,
    ) => {
      if (!session) return false;
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
      });
    },
    [router, session, echoOwner],
  );
}

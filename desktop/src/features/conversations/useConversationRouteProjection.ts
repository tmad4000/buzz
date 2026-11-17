import * as React from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { listPanes, type ConversationView } from "./layout/model";
import {
  conversationProjectionId,
  conversationRouteProjection,
} from "./routeProjection";
import { projectionEchoesFor } from "./projectionEchoes";
import type { ConversationWorkspaceSession } from "./useConversationWorkspace";

/** Project already-admitted local state. Never feed this callback back through resource navigation guards. */
export function useConversationRouteProjection({
  session,
  active,
  onError,
}: {
  session: ConversationWorkspaceSession | null;
  active: boolean;
  onError: (error: unknown) => void;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const [echoOwner] = React.useState(() => ({}));
  const mounted = React.useRef(false);
  const current = React.useRef({ session, active, navigate, onError });
  current.current = { session, active, navigate, onError };
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  React.useLayoutEffect(() => {
    if (!session) return;
    const echoes = projectionEchoesFor(session.controller);
    const unsubscribe = router.history.subscribe(({ location, action }) => {
      if (action.type !== "PUSH" && action.type !== "REPLACE") return;
      const id = conversationProjectionId(location.state);
      if (id && location.state.__TSR_key)
        echoes.bindHistoryEntry(id, location.state.__TSR_key);
    });
    return () => {
      unsubscribe();
      echoes.cancelOwner(echoOwner);
    };
  }, [session, router, echoOwner]);
  return React.useCallback(
    (view: ConversationView, options: { replace: boolean }) => {
      const latest = current.current;
      if (
        !mounted.current ||
        !session ||
        latest.session !== session ||
        !latest.active
      )
        return;
      const layout = session.controller.getSnapshot().layout;
      // The surface supplies the current committed view; stale visits must not
      // project an old resource/panel after navigation or a scope handoff.
      if (
        layout.views[view.id] !== view ||
        !listPanes(layout.root).some(
          (pane) =>
            pane.id === layout.focusedPaneId && pane.viewInstanceId === view.id,
        )
      )
        return;
      const projectionId = crypto.randomUUID();
      const echoes = projectionEchoesFor(session.controller);
      echoes.expect(
        projectionId,
        {
          scopeKey: session.scopeKey,
          viewId: view.id,
          channelId: view.channelId,
          panelState: view.panelState,
        },
        echoOwner,
      );
      const projection = conversationRouteProjection(
        view,
        session.scopeKey,
        options.replace,
        projectionId,
      );
      void latest.navigate(projection as never).catch((error: unknown) => {
        echoes.cancel(projectionId);
        if (mounted.current && current.current.session === session)
          current.current.onError(error);
      });
    },
    [session, echoOwner],
  );
}

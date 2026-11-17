import * as React from "react";
import { listPanes } from "./layout/model";
import {
  conversationHistoryViewId,
  conversationPanelStateFromSearch,
  sameConversationPanelRoute,
} from "./routeProjection";
import type { ConversationWorkspaceSession } from "./useConversationWorkspace";

export type IncomingConversationRoute = {
  /** Router entry key plus canonical href; must change for a distinct route action. */
  key: string;
  channelId: string;
  search: Record<string, unknown>;
  state: unknown;
};

/** Reconcile explicit incoming routes once; local focus/panel projection echoes do not navigate again. */
export function useConversationIncomingRoute({
  session,
  active,
  route,
  visibleViewIds,
  recentViewIds,
  onRejected,
  onAdmitted,
}: {
  session: ConversationWorkspaceSession | null;
  active: boolean;
  route: IncomingConversationRoute | null;
  visibleViewIds: ReadonlySet<string>;
  recentViewIds: readonly string[];
  onRejected: (route: IncomingConversationRoute) => void;
  onAdmitted?: (
    viewId: string,
    route: IncomingConversationRoute,
    options: { projectionEcho: boolean },
  ) => void;
}) {
  const [retry, setRetry] = React.useState(0);
  const attempted = React.useRef<{
    session: ConversationWorkspaceSession;
    key: string;
    retry: number;
  } | null>(null);
  React.useLayoutEffect(() => {
    if (!session || !active || !route) return;
    const previous = attempted.current;
    if (
      previous?.session === session &&
      previous.key === route.key &&
      previous.retry === retry
    ) {
      return;
    }
    // Record before invoking guards/subscribers. Removing a veto never replays
    // a pending action; the caller must request an explicit retry.
    attempted.current = { session, key: route.key, retry };
    const { controller } = session;
    const layout = controller.getSnapshot().layout;
    const historyViewId = conversationHistoryViewId(
      route.state,
      session.scopeKey,
    );
    const focused = listPanes(layout.root).find(
      (pane) => pane.id === layout.focusedPaneId,
    );
    const view = focused ? layout.views[focused.viewInstanceId] : null;
    if (
      view &&
      historyViewId === view.id &&
      view.channelId === route.channelId &&
      sameConversationPanelRoute(view.panelState, route.search)
    ) {
      onAdmitted?.(view.id, route, { projectionEcho: true });
      return;
    }
    const target = controller.navigateRoute({
      channelId: route.channelId,
      intent: historyViewId
        ? { kind: "history", viewInstanceId: historyViewId }
        : { kind: "external", channelId: route.channelId },
      panelState: conversationPanelStateFromSearch(route.search),
      visibleViewIds,
      recentViewIds,
    });
    if (!target) onRejected(route);
    else onAdmitted?.(target, route, { projectionEcho: false });
    // autoSend is deliberately excluded from presentation. An explicit,
    // separately guarded one-shot command adapter is still required.
  }, [
    session,
    active,
    route,
    visibleViewIds,
    recentViewIds,
    onRejected,
    onAdmitted,
    retry,
  ]);
  return React.useCallback(() => setRetry((value) => value + 1), []);
}

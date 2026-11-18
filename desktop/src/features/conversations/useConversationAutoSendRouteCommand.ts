import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import type { ConversationAutoSubmitScope } from "./ConversationAutoSubmitScope";
import { autoSendPermitToken, autoSendPermitsFor } from "./autoSendNavigation";
import { conversationProjectionId } from "./routeProjection";
import { listPanes } from "./layout/model";
import { useConversationAutoSendTriggerClear } from "./useConversationAutoSendTriggerClear";
import type { ConversationWorkspaceSession } from "./useConversationWorkspace";
import type { IncomingConversationRoute } from "./useConversationIncomingRoute";

const manualNotice =
  "Automatic send did not start. Review the draft and send it from this pane.";
type Pending = {
  scope: ConversationAutoSubmitScope;
  session: ConversationWorkspaceSession;
  entryKey: string;
  viewId: string;
  channelId: string;
  visit: number;
  draftKey: string;
  started: boolean;
  retired: boolean;
  owner: string | undefined;
  projectionId: string | null;
  projectionEntry: string | null;
  stop: () => void;
  retire: () => void;
};

/** One post-commit opportunity, never a queued send on mount or takeover. */
export function useConversationAutoSendRouteCommand({
  session,
  active,
  scopeRef,
}: {
  session: ConversationWorkspaceSession | null;
  active: boolean;
  scopeRef: React.RefObject<ConversationAutoSubmitScope | null>;
}) {
  const router = useRouter();
  const clear = useConversationAutoSendTriggerClear({ session, active });
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const owned = React.useRef<Pending | null>(null);
  const current = React.useRef({ session, active, clear });
  current.current = { session, active, clear };
  React.useLayoutEffect(() => {
    if (owned.current && (owned.current.session !== session || !active))
      owned.current.retire();
    setNotice(null);
  }, [session, active]);
  React.useLayoutEffect(
    () => () => {
      owned.current?.retire();
      owned.current?.stop();
      owned.current = null;
    },
    [],
  );

  const rejected = React.useCallback(
    (route: IncomingConversationRoute) => {
      const token = autoSendPermitToken(route.state);
      if (token) autoSendPermitsFor(router.history).cancel(token);
    },
    [router],
  );

  const admitted = React.useCallback(
    (
      viewId: string,
      route: IncomingConversationRoute,
      projectionEcho: boolean,
    ) => {
      if (projectionEcho) return;
      if (typeof route.search.autoSend !== "string" || !route.search.autoSend) {
        setNotice(null);
        return;
      }
      owned.current?.retire();
      owned.current?.stop();
      owned.current = null;
      const scope = scopeRef.current;
      const token = autoSendPermitToken(route.state);
      const permit =
        token && session
          ? autoSendPermitsFor(router.history).consume(token, {
              scopeKey: session.scopeKey,
              key:
                (route.state as { __TSR_key?: string } | null)?.__TSR_key ?? "",
              channelId: route.channelId,
              draftKey: route.search.autoSend,
              fresh:
                route.freshNavigation === true &&
                route.historyTraversal !== true,
              projectionEcho,
            })
          : null;
      const visit = session?.controller.visitToken(viewId);
      if (
        !permit ||
        !session ||
        !scope ||
        scope.scopeKey !== session.scopeKey ||
        visit === undefined ||
        current.current.session !== session ||
        !current.current.active
      ) {
        setNotice(manualNotice);
        return;
      }
      const lease: Pending = {
        scope,
        session,
        entryKey: route.key,
        viewId,
        channelId: permit.channelId,
        visit,
        draftKey: permit.draftKey,
        started: false,
        retired: false,
        owner: scope.coordinator.owner(permit.draftKey),
        projectionId: null,
        projectionEntry: null,
        stop: () => {},
        retire: () => {},
      };
      lease.retire = () => {
        if (lease.retired) return;
        lease.retired = true;
        scope.commands.retireAll();
      };
      const checkView = () => {
        const layout = session.controller.getSnapshot().layout;
        if (
          current.current.session !== session ||
          !current.current.active ||
          layout.views[viewId]?.channelId !== lease.channelId ||
          session.controller.visitToken(viewId) !== lease.visit ||
          !listPanes(layout.root).some(
            (pane) =>
              pane.id === layout.focusedPaneId &&
              pane.viewInstanceId === viewId,
          )
        )
          lease.retire();
      };
      const stopOwner = scope.coordinator.subscribe(() => {
        const next = scope.coordinator.owner(lease.draftKey);
        if (lease.owner === undefined) lease.owner = next;
        else if (next !== lease.owner) lease.retire();
      });
      const stopView = session.controller.subscribe(checkView);
      const stopHistory = router.history.subscribe(({ location, action }) => {
        if (
          action.type === "REPLACE" &&
          lease.projectionId &&
          !lease.projectionEntry &&
          typeof location.state.__TSR_key === "string" &&
          conversationProjectionId(location.state) === lease.projectionId
        ) {
          lease.projectionEntry = location.state.__TSR_key;
          return;
        }
        lease.retire();
      });
      const retire = () => lease.retire();
      window.addEventListener("blur", retire);
      document.addEventListener("visibilitychange", retire);
      let stopped = false;
      lease.stop = () => {
        if (stopped) return;
        stopped = true;
        stopOwner();
        stopView();
        stopHistory();
        window.removeEventListener("blur", retire);
        document.removeEventListener("visibilitychange", retire);
      };
      checkView();
      owned.current = lease;
      setNotice(null);
      setPending(lease);
    },
    [router, session, scopeRef],
  );

  React.useEffect(() => {
    if (!pending || pending.started) return;
    pending.started = true;
    const scope = scopeRef.current;
    const fail = () => {
      pending.retire();
      pending.stop();
      if (owned.current === pending) {
        owned.current = null;
        setNotice(manualNotice);
      }
    };
    if (
      pending.retired ||
      current.current.session !== pending.session ||
      !current.current.active ||
      !scope ||
      scope !== pending.scope ||
      !pending.owner ||
      scope.coordinator.owner(pending.draftKey) !== pending.owner ||
      JSON.stringify([
        router.state.location.state.__TSR_key,
        router.state.location.href,
      ]) !== pending.entryKey
    ) {
      fail();
      return;
    }
    // Endpoint absence/unready/preview is consumed once and stays manual. No polling.
    void scope.commands
      .request({
        entryKey: pending.entryKey,
        viewId: pending.viewId,
        channelId: pending.channelId,
        visit: pending.visit,
        draftKey: pending.draftKey,
        clearTrigger: async (entryKey, target) => {
          if (pending.retired || target.ownerId !== pending.owner) return false;
          const cleared = await current.current.clear(
            entryKey,
            target,
            (id) => {
              pending.projectionId = id;
            },
          );
          return cleared && !pending.retired;
        },
      })
      .then((outcome) => {
        if (outcome !== "submitted") fail();
      }, fail)
      .finally(() => {
        pending.stop();
        if (owned.current === pending) owned.current = null;
      });
  }, [pending, router, scopeRef]);
  return { admitted, rejected, notice, dismiss: () => setNotice(null) };
}

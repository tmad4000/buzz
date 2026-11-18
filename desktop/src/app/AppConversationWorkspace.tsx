import * as React from "react";
import { useLocation } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ConversationWorkspaceSurface } from "@/features/conversations/ConversationWorkspaceSurface";
import { useConversationWorkspace } from "@/features/conversations/useConversationWorkspace";
import { useConversationAutoSendNavigationScope } from "@/features/conversations/useConversationAutoSendNavigationScope";
import { useConversationIncomingRoute } from "@/features/conversations/useConversationIncomingRoute";
import { useConversationRouteProjection } from "@/features/conversations/useConversationRouteProjection";
import { listPanes } from "@/features/conversations/layout/model";
import { canDisplayLayout } from "@/features/conversations/layout/geometry";
import { useProjectsQuery } from "@/features/projects/hooks";
import { findProjectHomeByChannelId } from "@/features/projects/lib/projectHomeChannel";
import { isProjectCollectionAuthoritative } from "@/features/projects/projectSnapshot";
import type { Channel } from "@/shared/api/types";
import type { SearchHighlightNavigation } from "./navigation/searchHighlightNavigation";
import { admittedRouteSearchHighlight } from "@/features/conversations/routeSearchHighlight";
import { useConversationHistoryOrigin } from "@/features/conversations/useConversationHistoryOrigin";
import { hasSidebarConversationIntent } from "@/features/conversations/conversationNavigationIntent";
import { createWorkspaceFocusCycle } from "@/features/conversations/workspaceFocusCycle";

const ChannelRouteScreen = React.lazy(async () => {
  const module = await import("./routes/ChannelRouteScreen");
  return { default: module.ChannelRouteScreen };
});

export type AppConversationNavigation = {
  /** True means handled, including a target guard veto; never fall through after a veto. */
  selectChannel: (channelId: string) => boolean;
  cycleFocus: (direction: 1 | -1, target: EventTarget | null) => boolean;
};

function windowSlot() {
  try {
    const previous = sessionStorage.getItem("buzz:conversation-window:v1");
    if (previous && previous.length <= 256) return previous;
    const id = crypto.randomUUID();
    sessionStorage.setItem("buzz:conversation-window:v1", id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/** Kept mounted across global surfaces so pane/editor ownership follows the workspace lifetime. */
export function AppConversationWorkspace({
  children,
  community,
  scopeEpoch,
  pubkey,
  channels,
  membershipReady,
  excludedChannelIds,
  selectedChannelId,
  channelSurfaceActive,
  onFocusedChannelChange,
  navigationRef,
}: {
  children: React.ReactNode;
  community: { id: string; relayUrl: string } | null;
  scopeEpoch: number;
  pubkey: string | null;
  channels: readonly Channel[];
  membershipReady: boolean;
  excludedChannelIds: ReadonlySet<string>;
  selectedChannelId: string | null;
  channelSurfaceActive: boolean;
  onFocusedChannelChange: (channelId: string | null) => void;
  navigationRef: React.RefObject<AppConversationNavigation | null>;
}) {
  const location = useLocation();
  const historyOrigin = useConversationHistoryOrigin();
  const queryClient = useQueryClient();
  const projects = useProjectsQuery();
  const [slot] = React.useState(windowSlot);
  const root = React.useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = React.useState({
    width: 0,
    height: 0,
    viewport: 0,
  });
  const [message, setMessage] = React.useState<string | null>(null);
  const [retryAction, setRetryAction] = React.useState<
    | { kind: "incoming" | "projection" }
    | { kind: "selection"; scopeKey: string; channelId: string }
    | null
  >(null);
  const recent = React.useRef<string[]>([]);
  const [highlights, setHighlights] = React.useState<
    Record<
      string,
      {
        scopeKey: string;
        channelId: string;
        visit: number;
        value: SearchHighlightNavigation | null;
      }
    >
  >({});
  React.useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setBounds((previous) =>
        previous.width === rect.width &&
        previous.height === rect.height &&
        previous.viewport === window.innerWidth
          ? previous
          : {
              width: rect.width,
              height: rect.height,
              viewport: window.innerWidth,
            },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const ready =
    membershipReady &&
    projects.data !== undefined &&
    isProjectCollectionAuthoritative(queryClient);
  const resolveConversation = React.useCallback(
    (id: string) => {
      if (!ready) return null;
      const channel = channels.find((item) => item.id === id);
      return channel?.isMember &&
        channel.archivedAt === null &&
        (channel.channelType === "stream" || channel.channelType === "dm") &&
        !excludedChannelIds.has(id) &&
        !findProjectHomeByChannelId(id, projects.data ?? [])
        ? { channelId: id, label: channel.name }
        : null;
    },
    [channels, excludedChannelIds, ready, projects.data],
  );
  const canOpen = React.useCallback(
    (id: string) => resolveConversation(id) !== null,
    [resolveConversation],
  );
  const { session, snapshot, error } = useConversationWorkspace({
    scope:
      community && pubkey
        ? {
            communityId: community.id,
            identityPubkey: pubkey,
            windowSlot: slot,
          }
        : null,
    relayUrl: community?.relayUrl ?? null,
    scopeEpoch,
    ready,
    initialChannelId: selectedChannelId,
    canOpen,
  });
  const active = Boolean(
    channelSurfaceActive && selectedChannelId && canOpen(selectedChannelId),
  );
  useConversationAutoSendNavigationScope(session?.scopeKey ?? null);
  const panes = snapshot ? listPanes(snapshot.layout.root) : [];
  const focusedViewId = panes.find(
    (pane) => pane.id === snapshot?.layout.focusedPaneId,
  )?.viewInstanceId;
  const focusedView = focusedViewId
    ? snapshot?.layout.views[focusedViewId]
    : null;
  React.useLayoutEffect(() => {
    setHighlights((previous) => {
      const kept = Object.entries(previous).filter(
        ([id, entry]) =>
          session !== null &&
          session.scopeKey === entry.scopeKey &&
          snapshot?.layout.views[id]?.channelId === entry.channelId &&
          session.controller.visitToken(id) === entry.visit,
      );
      return kept.length === Object.keys(previous).length
        ? previous
        : Object.fromEntries(kept);
    });
  }, [session, snapshot?.layout.views]);
  React.useLayoutEffect(() => {
    onFocusedChannelChange(active ? (focusedView?.channelId ?? null) : null);
  }, [active, focusedView?.channelId, onFocusedChannelChange]);
  React.useLayoutEffect(() => {
    if (!session || !focusedViewId) return;
    const live = new Set(panes.map((pane) => pane.viewInstanceId));
    recent.current = [
      focusedViewId,
      ...recent.current.filter((id) => id !== focusedViewId && live.has(id)),
    ];
  }, [session, focusedViewId, panes]);
  const project = useConversationRouteProjection({
    session,
    active,
    onError: () => {
      setRetryAction({ kind: "projection" });
      setMessage("Could not update the conversation address. Try again.");
    },
  });
  const routeContextKey = JSON.stringify([
    location.href,
    location.state.__TSR_key,
  ]);
  const previousRouteContext = React.useRef({ session, key: routeContextKey });
  React.useLayoutEffect(() => {
    if (
      previousRouteContext.current.session === session &&
      previousRouteContext.current.key === routeContextKey
    )
      return;
    previousRouteContext.current = { session, key: routeContextKey };
    setMessage(null);
    setRetryAction(null);
  }, [session, routeContextKey]);
  const visible = new Set(
    snapshot && canDisplayLayout(snapshot.layout.root, bounds, bounds.viewport)
      ? panes.map((pane) => pane.viewInstanceId)
      : focusedViewId
        ? [focusedViewId]
        : [],
  );
  const retry = useConversationIncomingRoute({
    session,
    active:
      active &&
      bounds.width > 0 &&
      bounds.height > 0 &&
      historyOrigin.entryKey === location.state.__TSR_key,
    route:
      selectedChannelId && channelSurfaceActive
        ? {
            key: JSON.stringify([location.state.__TSR_key, location.href]),
            channelId: selectedChannelId,
            search: location.search as Record<string, unknown>,
            state: location.state,
            historyTraversal: historyOrigin.traversal,
            sidebarNavigation:
              historyOrigin.fresh &&
              hasSidebarConversationIntent(location.state),
          }
        : null,
    visibleViewIds: visible,
    recentViewIds: recent.current,
    onAdmitted: (viewId, route, { projectionEcho }) => {
      if (!session) return;
      const view = session.controller.getSnapshot().layout.views[viewId];
      const visit = session.controller.visitToken(viewId);
      if (!view || visit === undefined) return;
      const value = admittedRouteSearchHighlight(
        route,
        view.channelId,
        projectionEcho,
      );
      if (value === undefined) return;
      setHighlights((previous) => ({
        ...previous,
        [viewId]: {
          scopeKey: session.scopeKey,
          channelId: view.channelId,
          visit,
          value,
        },
      }));
    },
    onRejected: () => {
      setRetryAction({ kind: "incoming" });
      setMessage(
        "Finish or cancel your current edit, upload or recording before changing this conversation.",
      );
    },
  });
  const focusCycle = React.useRef<ReturnType<
    typeof createWorkspaceFocusCycle
  > | null>(null);
  const focusCycleState = React.useRef({ session, active, project });
  focusCycleState.current = { session, active, project };
  React.useLayoutEffect(() => {
    const workspace = root.current;
    const scope = workspace?.closest<HTMLElement>(
      "[data-conversation-focus-scope]",
    );
    if (!workspace || !scope || !session) return;
    const cycle = createWorkspaceFocusCycle({
      scope,
      workspace,
      enabled: () =>
        focusCycleState.current.session === session &&
        focusCycleState.current.active,
      panes: () =>
        listPanes(session.controller.getSnapshot().layout.root).map((pane) => ({
          paneId: pane.id,
          viewId: pane.viewInstanceId,
        })),
      focusedViewId: () => {
        const layout = session.controller.getSnapshot().layout;
        return (
          listPanes(layout.root).find(
            (pane) => pane.id === layout.focusedPaneId,
          )?.viewInstanceId ?? null
        );
      },
      focusView: (viewId) => {
        const pane = listPanes(
          session.controller.getSnapshot().layout.root,
        ).find((candidate) => candidate.viewInstanceId === viewId);
        if (!pane) return false;
        session.controller.focus(pane.id);
        const layout = session.controller.getSnapshot().layout;
        if (layout.focusedPaneId !== pane.id) return false;
        setMessage(null);
        setRetryAction(null);
        focusCycleState.current.project(layout.views[viewId], {
          replace: true,
        });
        return true;
      },
    });
    focusCycle.current = cycle;
    return () => {
      cycle.dispose();
      if (focusCycle.current === cycle) focusCycle.current = null;
    };
  }, [session]);
  React.useLayoutEffect(() => {
    let alive = true;
    const port: AppConversationNavigation = {
      cycleFocus: (direction, target) =>
        alive ? (focusCycle.current?.cycle(direction, target) ?? false) : false,
      selectChannel: (channelId) => {
        if (!alive || !active || !session || !canOpen(channelId)) return false;
        const viewId = session.controller.navigateRoute({
          channelId,
          intent: { kind: "sidebar" },
          visibleViewIds: visible,
          recentViewIds: recent.current,
        });
        if (viewId) {
          setMessage(null);
          setRetryAction(null);
          const view = session.controller.getSnapshot().layout.views[viewId];
          project(view, { replace: false });
        } else {
          setRetryAction({
            kind: "selection",
            scopeKey: session.scopeKey,
            channelId,
          });
          setMessage(
            "Finish or cancel your current edit, upload or recording before changing this conversation.",
          );
        }
        return true;
      },
    };
    navigationRef.current = port;
    return () => {
      alive = false;
      if (navigationRef.current === port) navigationRef.current = null;
    };
  }, [session, active, canOpen, visible, project, navigationRef]);
  return (
    <div ref={root} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {session && snapshot ? (
        <React.Suspense fallback={null}>
          <ConversationWorkspaceSurface
            key={session.scopeKey}
            session={session}
            snapshot={snapshot}
            active={active}
            resolveConversation={resolveConversation}
            onFocusedViewChange={(view, options) => {
              setMessage(null);
              setRetryAction(null);
              project(view, options);
            }}
            renderRoute={(view, renderChannel) => (
              <ChannelRouteScreen
                renderChannel={renderChannel}
                channelId={view.channelId}
                autoSendDraftKey={null}
                selectedPostId={null}
                searchHighlight={
                  highlights[view.id]?.scopeKey === session.scopeKey &&
                  highlights[view.id]?.channelId === view.channelId &&
                  highlights[view.id]?.visit ===
                    session.controller.visitToken(view.id)
                    ? highlights[view.id].value
                    : undefined
                }
                targetMessageId={view.panelState.messageId ?? null}
                targetReplyId={null}
                targetThreadRootId={
                  view.panelState.threadRootId ?? view.panelState.thread ?? null
                }
              />
            )}
          />
        </React.Suspense>
      ) : null}
      {active ? null : children}
      {active && !session ? (
        <p role="status" className="p-4 text-sm text-muted-foreground">
          Loading conversation…
        </p>
      ) : null}
      {active && (message || error) ? (
        <div
          role="status"
          className="absolute inset-x-3 bottom-3 z-50 rounded-md border bg-background p-3 text-sm"
        >
          <p>{message || error}</p>
          <button
            type="button"
            onClick={() => {
              setMessage(null);
              setRetryAction(null);
              if (retryAction?.kind === "selection") {
                if (retryAction.scopeKey === session?.scopeKey)
                  navigationRef.current?.selectChannel(retryAction.channelId);
              } else if (retryAction?.kind === "projection") {
                if (focusedView) project(focusedView, { replace: true });
              } else retry();
            }}
          >
            Retry navigation
          </button>
          {focusedView ? (
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setRetryAction(null);
                project(focusedView, { replace: true });
              }}
            >
              Keep current conversation
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

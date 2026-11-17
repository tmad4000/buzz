import * as React from "react";
import type { ChannelScreenProps } from "@/features/channels/ui/ChannelScreen.types";
import { ConversationDraftEditorsProvider } from "./ConversationDraftEditors";
import { ConversationLayoutSurface } from "./ConversationLayoutSurface";
import type { ConversationPaneCommand } from "./ConversationPaneMenu";
import type { DraggedConversation } from "./ConversationPaneDropTarget";
import { ConversationViewGuardsContext } from "./ConversationViewGuards";
import { ConversationViewHost } from "./ConversationViewHost";
import { bindVisitPreferences } from "./layout/visitPreferences";
import { listPanes, type ConversationView } from "./layout/model";
import type { LayoutControllerSnapshot } from "./layout/controller";
import type { ConversationWorkspaceSession } from "./useConversationWorkspace";

type Props = {
  session: ConversationWorkspaceSession;
  snapshot: LayoutControllerSnapshot;
  active: boolean;
  /** Return authorized existing stream/DM resources; project homes, forums and huddle routes stay outside this surface. */
  resolveConversation: (channelId: string) => DraggedConversation | null;
  /** Reuse ChannelRouteScreen preparation, with a resource/visit key owned here. */
  renderRoute: (
    view: ConversationView,
    renderChannel: (props: ChannelScreenProps) => React.ReactNode,
  ) => React.ReactNode;
  /** Presentation focus was already committed; mirror the canonical URL without replacing another view. */
  onFocusedViewChange?: (view: ConversationView) => void;
};

/** One production workspace surface under the AppShell's existing drag coordinator. */
export function ConversationWorkspaceSurface({
  session,
  snapshot,
  active,
  resolveConversation,
  renderRoute,
  onFocusedViewChange,
}: Props) {
  const root = React.useRef<HTMLDivElement>(null);
  const sequence = React.useRef(0);
  const [focusRequest, setFocusRequest] = React.useState<{
    viewId: string;
    sequence: number;
    owner: ConversationWorkspaceSession["controller"];
    epoch: number;
  }>();
  const activity = React.useRef({ active, epoch: 0 });
  if (activity.current.active !== active)
    activity.current = { active, epoch: activity.current.epoch + 1 };
  const { controller } = session;
  const current = React.useRef({
    active,
    controller,
    onFocusedViewChange,
    resolveConversation,
  });
  current.current = {
    active,
    controller,
    onFocusedViewChange,
    resolveConversation,
  };
  const canHandle = () =>
    current.current.active && current.current.controller === controller;
  const resolve = (channelId: string) => {
    const candidate = current.current.resolveConversation(channelId);
    return candidate?.channelId === channelId ? candidate : null;
  };
  const bounds = () =>
    root.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
  const focused = () => {
    const state = controller.getSnapshot().layout;
    const pane = listPanes(state.root).find(
      (item) => item.id === state.focusedPaneId,
    );
    return pane ? state.views[pane.viewInstanceId] : undefined;
  };
  const announceFocus = (requestHeader: boolean) => {
    if (!canHandle()) return;
    const view = focused();
    if (!view) return;
    current.current.onFocusedViewChange?.(view);
    if (requestHeader && canHandle())
      setFocusRequest({
        viewId: view.id,
        sequence: ++sequence.current,
        owner: controller,
        epoch: activity.current.epoch,
      });
  };
  const focusPane = (paneId: string) => {
    if (!canHandle()) return;
    if (controller.focus(paneId)) announceFocus(false);
  };
  const command = (paneId: string, intent: ConversationPaneCommand) => {
    if (!canHandle()) return;
    const layout = controller.getSnapshot().layout;
    const panes = listPanes(layout.root);
    const pane = panes.find((item) => item.id === paneId);
    if (!pane) return;
    let changed = false;
    if (intent === "splitRight" || intent === "splitBottom") {
      changed = controller.open(
        paneId,
        layout.views[pane.viewInstanceId].channelId,
        intent === "splitRight" ? "horizontal" : "vertical",
        bounds(),
        window.innerWidth,
      );
    } else if (intent === "swap" && panes.length === 2) {
      changed = controller.swap(panes[0].id, panes[1].id);
    } else if (intent === "horizontal" || intent === "vertical") {
      changed = controller.orient(intent, bounds(), window.innerWidth);
    } else if (intent === "close" || intent === "closeSplit") {
      changed = controller.close(paneId, intent === "closeSplit");
    } else if (intent === "restore") {
      changed = controller.restore();
    }
    if (changed) announceFocus(true);
  };
  return (
    <div
      ref={root}
      className="absolute inset-0 min-h-0 min-w-0"
      style={{
        visibility: active ? "visible" : "hidden",
        pointerEvents: active ? undefined : "none",
      }}
      aria-hidden={!active || undefined}
      inert={!active ? true : undefined}
      data-conversation-workspace
    >
      <ConversationViewGuardsContext.Provider value={session.guards}>
        <ConversationDraftEditorsProvider key={session.scopeKey}>
          <ConversationLayoutSurface
            layout={snapshot.layout}
            canRestore={snapshot.canRestore}
            focusRequest={
              active &&
              focusRequest?.owner === controller &&
              focusRequest.epoch === activity.current.epoch
                ? focusRequest
                : undefined
            }
            labelForView={(view) =>
              resolve(view.channelId)?.label ?? "Conversation unavailable"
            }
            onFocusPane={focusPane}
            onResize={(id, sizes, commit) => {
              if (canHandle()) controller.resize(id, sizes, commit);
            }}
            onCommand={command}
            dragTarget={
              active
                ? {
                    resolveConversation: (id) =>
                      canHandle() ? resolve(id) : null,
                    onOpen: (drop) => {
                      if (!canHandle()) return;
                      if (
                        controller.open(
                          drop.paneId,
                          drop.channelId,
                          drop.edge === "right" ? "horizontal" : "vertical",
                          bounds(),
                          window.innerWidth,
                        )
                      )
                        announceFocus(true);
                    },
                  }
                : undefined
            }
            renderPane={({
              view,
              pane,
              focused: hasFocus,
              visible,
              headerEndActions,
            }) => {
              const available = resolve(view.channelId);
              if (!available)
                return (
                  <section
                    className="flex h-full min-w-0 flex-col p-4"
                    aria-label="Conversation unavailable"
                    onPointerDownCapture={() => focusPane(pane.id)}
                    onFocusCapture={() => focusPane(pane.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-medium">
                        Conversation unavailable
                      </h2>
                      {headerEndActions}
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Choose a conversation from the sidebar, or close this
                      pane.
                    </p>
                  </section>
                );
              const visit = controller.visitToken(view.id);
              return (
                <React.Fragment
                  key={JSON.stringify([view.id, view.channelId, visit])}
                >
                  {renderRoute(view, (channel) => {
                    if (
                      channel.activeChannel?.id !== view.channelId ||
                      channel.currentIdentity?.pubkey !==
                        session.scope.identityPubkey
                    ) {
                      return (
                        <section
                          className="flex h-full min-w-0 flex-col p-4"
                          aria-label={available.label}
                          onPointerDownCapture={() => focusPane(pane.id)}
                          onFocusCapture={() => focusPane(pane.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-medium">
                              {available.label}
                            </h2>
                            {headerEndActions}
                          </div>
                          <p
                            role="status"
                            className="mt-3 text-sm text-muted-foreground"
                          >
                            Loading conversation…
                          </p>
                        </section>
                      );
                    }
                    return (
                      <ConversationViewHost
                        {...bindVisitPreferences(controller, view)}
                        viewInstanceId={view.id}
                        focused={hasFocus}
                        visible={visible}
                        interactive={active}
                        label={available.label}
                        initialPanelState={view.panelState}
                        onPanelNavigate={(patch) => {
                          if (!canHandle()) return;
                          if (
                            controller.update(view.id, view.channelId, visit, {
                              panelState: patch,
                            }) &&
                            controller.getSnapshot().layout.focusedPaneId ===
                              pane.id
                          )
                            announceFocus(false);
                        }}
                        onFocusView={() => focusPane(pane.id)}
                        channel={{ ...channel, headerEndActions }}
                      />
                    );
                  })}
                </React.Fragment>
              );
            }}
          />
        </ConversationDraftEditorsProvider>
      </ConversationViewGuardsContext.Provider>
      {snapshot.message ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-3 bottom-3 z-40 rounded-md border bg-background/95 p-2 text-xs"
        >
          {snapshot.message}
        </p>
      ) : null}
    </div>
  );
}

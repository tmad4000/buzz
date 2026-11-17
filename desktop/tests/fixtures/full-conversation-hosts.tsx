// Test fixture only: real ChannelScreen/ChannelPane/composer hooks over the
// existing mock IPC bridge. No relay, native build or production account.
import * as React from "react";
import { ConversationDragCoordinator } from "@/features/conversations/ConversationDragCoordinator";
import { FixtureDragSidebar } from "./shared-drag-sidebar";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { AppShellProvider, useAppShell } from "@/app/AppShellContext";
import { useMarkAsReadShortcuts } from "@/app/useMarkAsReadShortcuts";
import { ConversationLayoutSurface } from "@/features/conversations/ConversationLayoutSurface";
import {
  createConversationView,
  createSingleLayout,
  splitPane,
  swapPanes,
  resizeGroup,
  focusPane,
  closePane,
  orientGroup,
  listPanes,
  updateViewPresentation,
  navigateView,
  type ConversationLayout,
} from "@/features/conversations/layout/model";
import { ConversationViewHost } from "@/features/conversations/ConversationViewHost";
import { ConversationDraftEditorsProvider } from "@/features/conversations/ConversationDraftEditors";
import { HuddleProvider } from "@/features/huddle/HuddleContext";
import { CommunitiesProvider } from "@/features/communities/useCommunities";
import { useReadState } from "@/features/channels/readState/useReadState";
import {
  initDraftStore,
  persistDraftEntry,
} from "@/features/messages/lib/useDrafts";
import { getChannels } from "@/shared/api/tauriChannels";
import { getIdentity } from "@/shared/api/tauriIdentity";
import { UpdaterProvider } from "@/features/settings/hooks/UpdaterProvider";
import { ThemeProvider } from "@/shared/theme/ThemeProvider";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { EmojiBurstProvider } from "@/shared/ui/EmojiBurstProvider";
import { PoofBurstProvider } from "@/shared/ui/PoofBurstProvider";
import type { Channel, Identity, RelayEvent } from "@/shared/api/types";
import type { RelayClient } from "@/shared/api/relayClientSession";
import "@fontsource-variable/inter/opsz.css";
import "@/shared/styles/globals.css";

const harnessWindow = window as typeof window & {
  hostReads: { view: string; kind: string; id: string }[];
  hostEffective: (messageId: string) => number | null;
  hostChannelRead: () => number | null;
  layoutSnapshot?: () => ConversationLayout;
  dragEvents?: Record<string, unknown>[];
};
harnessWindow.hostReads = [];
const community = {
  id: "split-host-test",
  name: "Split host test",
  relayUrl: "ws://localhost:3000",
  addedAt: new Date().toISOString(),
};
localStorage.setItem("buzz-communities", JSON.stringify([community]));
localStorage.setItem("buzz-active-community-id", community.id);
window.__BUZZ_E2E__ = { mode: "mock" };
const { maybeInstallE2eTauriMocks } = await import("@/testing/e2eBridge");
maybeInstallE2eTauriMocks();
const identity: Identity = await getIdentity();
const fixtureChannels = (await getChannels(null)).channels ?? [];
const channel: Channel | undefined = fixtureChannels.find(
  (value) => value.name === "general",
);
if (!channel) throw new Error("Missing synthetic general channel");
initDraftStore(identity.pubkey, community.relayUrl);
persistDraftEntry(
  channel.id,
  "Restored draft must never auto-send",
  channel.id,
  [],
  [],
  [],
);
const rootA = "1".repeat(64);
const rootB = "2".repeat(64);
for (const [id, content, parentEventId] of [
  [rootA, "Release plan for pane A", undefined],
  ["3".repeat(64), "Reply belonging to the release plan", rootA],
  [rootB, "Design decisions for pane B", undefined],
  ["4".repeat(64), "Reply belonging to the design discussion", rootB],
] as const) {
  await window.__BUZZ_E2E_EMIT_MOCK_MESSAGE__?.({
    id,
    content,
    parentEventId,
    channelName: "general",
    pubkey: "c".repeat(64),
    createdAt: Math.floor(Date.now() / 1000),
  });
}
const fakeRelay = {
  fetchEvents: async () => [],
  publishEvent: async () => {},
  subscribeInteractive: () => () => {},
} as unknown as RelayClient;
const noop = () => {};
const emptyEvents: RelayEvent[] = [];
function PerViewShell({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const base = useAppShell();
  const value = React.useMemo(
    () => ({
      ...base,
      markChannelRead: (...args: Parameters<typeof base.markChannelRead>) => {
        harnessWindow.hostReads.push({
          view: id,
          kind: "channel",
          id: args[0],
        });
        base.markChannelRead(...args);
      },
      markMessageRead: (...args: Parameters<typeof base.markMessageRead>) => {
        harnessWindow.hostReads.push({
          view: id,
          kind: "message",
          id: args[0],
        });
        base.markMessageRead(...args);
      },
    }),
    [base, id],
  );
  return <AppShellProvider value={value}>{children}</AppShellProvider>;
}
const layoutFixture = new URLSearchParams(location.search).has("layout");
const dragFixture = new URLSearchParams(location.search).has("drag");
harnessWindow.dragEvents = [];
function FixtureDragScope({ children }: { children: React.ReactNode }) {
  const [generation, setGeneration] = React.useState(0);
  return (
    <ConversationDragCoordinator scopeKey={`fixture-${generation}`}>
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        {dragFixture && (
          <button
            type="button"
            className="sr-only"
            data-testid="change-drag-scope"
            onClick={() => setGeneration((value) => value + 1)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setGeneration((value) => value + 1);
              }
            }}
          >
            Change drag scope
          </button>
        )}
        {children}
      </div>
    </ConversationDragCoordinator>
  );
}
function LayoutBody() {
  const [focusRequest, setFocusRequest] = React.useState<{
    viewId: string;
    sequence: number;
  }>();
  const focusSequence = React.useRef(0);
  const [layout, setLayout] = React.useState(() => {
    const view = {
      ...createConversationView(channel?.id ?? "missing"),
      id: "a",
      panelState: { thread: rootA },
    };
    const initial = createSingleLayout(view, (kind) => `${kind}-a`);
    if (dragFixture || new URLSearchParams(location.search).has("single"))
      return initial;
    return focusPane(
      splitPane(
        initial,
        initial.root.id,
        {
          ...createConversationView(view.channelId),
          id: "b",
          panelState: { thread: rootB },
        },
        "horizontal",
        (kind) => `${kind}-b`,
      ),
      initial.root.id,
    );
  });
  const lastSplit = React.useRef<ConversationLayout | null>(null);
  harnessWindow.layoutSnapshot = () => layout;
  return (
    <div className="flex h-full min-h-0 min-w-0">
      {dragFixture && (
        <FixtureDragSidebar
          channels={fixtureChannels}
          onEvent={(event) => harnessWindow.dragEvents?.push(event)}
        />
      )}
      <div className="min-h-0 min-w-0 flex-1">
        <ConversationLayoutSurface
          dragTarget={
            dragFixture
              ? {
                  resolveConversation: (id) => {
                    const target = fixtureChannels.find(
                      (value) =>
                        value.id === id &&
                        (value.channelType === "stream" ||
                          value.channelType === "dm"),
                    );
                    return target
                      ? {
                          channelId: target.id,
                          label:
                            target.channelType === "dm"
                              ? "Existing DM"
                              : target.name,
                        }
                      : null;
                  },
                  onOpen: (drop) => {
                    const target = listPanes(layout.root).find(
                      (pane) => pane.id === drop.paneId,
                    );
                    if (!target) return;
                    const source = layout.views[target.viewInstanceId];
                    const incoming = drop.replace
                      ? null
                      : createConversationView(
                          drop.channelId,
                          undefined,
                          source.channelId === drop.channelId
                            ? source
                            : undefined,
                        );
                    harnessWindow.dragEvents?.push({ type: "canvas", ...drop });
                    setLayout((current) => {
                      const pane = listPanes(current.root).find(
                        (value) => value.id === drop.paneId,
                      );
                      if (
                        !pane ||
                        current.views[pane.viewInstanceId].channelId !==
                          source.channelId
                      )
                        return current;
                      return incoming
                        ? splitPane(
                            current,
                            pane.id,
                            incoming,
                            drop.edge === "right" ? "horizontal" : "vertical",
                          )
                        : focusPane(
                            navigateView(
                              current,
                              pane.viewInstanceId,
                              drop.channelId,
                            ),
                            pane.id,
                          );
                    });
                    setFocusRequest({
                      viewId: incoming?.id ?? source.id,
                      sequence: ++focusSequence.current,
                    });
                  },
                }
              : undefined
          }
          layout={layout}
          focusRequest={focusRequest}
          labelForView={(view) =>
            dragFixture
              ? view.channelId === channel?.id
                ? `General ${view.id === "a" ? "A" : "B"}`
                : "Existing DM"
              : `General ${view.id}`
          }
          onFocusPane={(id) => setLayout((current) => focusPane(current, id))}
          onResize={(id, sizes) =>
            setLayout((current) => resizeGroup(current, id, sizes))
          }
          canRestore={lastSplit.current !== null}
          onCommand={(paneId, command) => {
            if (command === "splitRight" || command === "splitBottom") {
              const pane = listPanes(layout.root).find(
                (value) => value.id === paneId,
              );
              if (!pane) return;
              const source = layout.views[pane.viewInstanceId];
              const view = createConversationView(
                source.channelId,
                undefined,
                source,
              );
              setLayout((current) =>
                splitPane(
                  current,
                  paneId,
                  view,
                  command === "splitRight" ? "horizontal" : "vertical",
                ),
              );
              setFocusRequest({
                viewId: view.id,
                sequence: ++focusSequence.current,
              });
              return;
            }
            setLayout((current) => {
              const panes = listPanes(current.root);

              if (command === "swap" && panes.length === 2)
                return swapPanes(current, panes[0].id, panes[1].id);
              if (
                (command === "horizontal" || command === "vertical") &&
                current.root.kind === "group"
              )
                return orientGroup(current, current.root.id, command);
              if (command === "close") {
                lastSplit.current = current;
                return closePane(current, paneId);
              }
              if (command === "closeSplit") {
                lastSplit.current = current;
                return panes.reduce(
                  (next, pane) =>
                    pane.id === current.focusedPaneId
                      ? next
                      : closePane(next, pane.id),
                  current,
                );
              }
              if (command === "restore" && lastSplit.current)
                return lastSplit.current;
              return current;
            });
          }}
          renderPane={({ view, pane, focused, visible, headerEndActions }) => (
            <PerViewShell id={view.id}>
              <ConversationViewHost
                viewInstanceId={view.id}
                focused={focused}
                visible={visible}
                label={`General ${view.id}`}
                initialPanelState={view.panelState}
                onPanelNavigate={(patch) =>
                  setLayout((current) =>
                    updateViewPresentation(current, view.id, view.channelId, {
                      panelState: patch,
                    }),
                  )
                }
                onFocusView={() =>
                  setLayout((current) => focusPane(current, pane.id))
                }
                channel={{
                  activeChannel:
                    fixtureChannels.find(
                      (value) => value.id === view.channelId,
                    ) ?? null,
                  currentIdentity: identity,
                  headerEndActions,
                  autoSendDraftKey: channel?.id ?? null,
                  onCloseForumPost: noop,
                  onSelectForumPost: noop,
                  selectedForumPostId: null,
                  targetForumReplyId: null,
                  targetMessageEvents: emptyEvents,
                  targetMessageId: null,
                }}
              />
            </PerViewShell>
          )}
        />
      </div>
    </div>
  );
}
function Screen() {
  useMarkAsReadShortcuts({
    activeChannelId: channel?.id ?? null,
    activeChannelLastMessageAt: channel?.lastMessageAt,
    selectedView: dragFixture ? "channel" : "home",
    markChannelRead: (id) => {
      if (dragFixture)
        harnessWindow.dragEvents?.push({
          type: "shortcut-mark-read",
          channelId: id,
        });
    },
    markAllChannelsRead: () => {
      if (dragFixture)
        harnessWindow.dragEvents?.push({ type: "shortcut-mark-all" });
    },
  });
  const fallback = useAppShell();
  const read = useReadState(identity.pubkey, fakeRelay);
  harnessWindow.hostEffective = (id: string) =>
    read.getEffectiveTimestamp(`msg:${id}`);
  harnessWindow.hostChannelRead = () =>
    read.getEffectiveTimestamp(channel?.id ?? "none");
  const [focused, setFocused] = React.useState("a");
  const [showA, setShowA] = React.useState(true);
  const shell = React.useMemo(
    () => ({
      ...fallback,
      registerContextParents: read.registerContextParents,
      readStateVersion: read.readStateVersion,
      getChannelReadAt: read.getEffectiveTimestamp,
      getMessageReadAt: (id: string) => read.getEffectiveTimestamp(`msg:${id}`),
      markChannelRead: (id: string, at?: string | null) => {
        if (at) read.seedContextRead(id, Math.floor(Date.parse(at) / 1000));
      },
      markMessageRead: (id: string, at: number) =>
        read.seedContextRead(`msg:${id}`, at),
    }),
    [
      fallback,
      read.registerContextParents,
      read.readStateVersion,
      read.getEffectiveTimestamp,
      read.seedContextRead,
    ],
  );
  return (
    <AppShellProvider value={shell}>
      <ConversationDraftEditorsProvider>
        <main className="flex h-screen flex-col bg-background text-foreground">
          <div className="flex gap-3 border-b border-border p-2">
            <span>
              Buzz Ideaflow ·{" "}
              {layoutFixture
                ? "layout regression"
                : "production host regression"}
            </span>
            {!layoutFixture && (
              <button
                type="button"
                onClick={() => {
                  setShowA(false);
                  setFocused("b");
                }}
              >
                Unmount A
              </button>
            )}
          </div>
          <div
            className="grid min-h-0 flex-1"
            style={{
              gridTemplateColumns: layoutFixture
                ? "1fr"
                : showA
                  ? "1fr 1fr"
                  : "1fr",
            }}
          >
            {layoutFixture ? (
              <FixtureDragScope>
                <LayoutBody />
              </FixtureDragScope>
            ) : (
              [...(showA ? ["a"] : []), "b"].map((id) => (
                <PerViewShell key={id} id={id}>
                  <ConversationViewHost
                    viewInstanceId={id}
                    focused={focused === id}
                    visible
                    label={`General ${id}`}
                    onFocusView={setFocused}
                    initialPanelState={{ thread: id === "a" ? rootA : rootB }}
                    channel={{
                      activeChannel: channel ?? null,
                      currentIdentity: identity,
                      autoSendDraftKey: channel?.id ?? null,
                      onCloseForumPost: noop,
                      onSelectForumPost: noop,
                      selectedForumPostId: null,
                      targetForumReplyId: null,
                      targetMessageEvents: emptyEvents,
                      targetMessageId: null,
                    }}
                  />
                </PerViewShell>
              ))
            )}
          </div>
        </main>
      </ConversationDraftEditorsProvider>
    </AppShellProvider>
  );
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
const router = createRouter({
  routeTree: createRootRoute({ component: Screen }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <QueryClientProvider client={client}>
      <CommunitiesProvider>
        <ThemeProvider defaultTheme="buzz">
          <TooltipProvider>
            <EmojiBurstProvider>
              <PoofBurstProvider>
                <UpdaterProvider>
                  <HuddleProvider ownsAudioSession={false}>
                    <RouterProvider router={router} />
                  </HuddleProvider>
                </UpdaterProvider>
              </PoofBurstProvider>
            </EmojiBurstProvider>
          </TooltipProvider>
        </ThemeProvider>
      </CommunitiesProvider>
    </QueryClientProvider>,
  );

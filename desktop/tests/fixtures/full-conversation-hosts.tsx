// Test fixture only: real ChannelScreen/ChannelPane/composer hooks over the
// existing mock IPC bridge. No relay, native build or production account.
import * as React from "react";
import {
  resolveThreadReplySeenAt,
  threadReplySeenKey,
  threadSeenKey,
} from "@/features/channels/readState/threadReplySeen";
import {
  ConversationViewGuards,
  ConversationViewGuardsContext,
} from "@/features/conversations/ConversationViewGuards";
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
  focusPane,
  listPanes,
} from "@/features/conversations/layout/model";
import { ConversationLayoutController } from "@/features/conversations/layout/controller";
import { layoutStorageKey } from "@/features/conversations/layout/storage";
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
import { Toaster } from "@/shared/ui/sonner";
import "@fontsource-variable/inter/opsz.css";
import "@/shared/styles/globals.css";

const harnessWindow = window as typeof window & {
  hostReads: { view: string; kind: string; id: string }[];
  hostEffective: (messageId: string) => number | null;
  hostChannelRead: () => number | null;
  hostSeen?: (rootId: string, replyId: string) => number | null;
  layoutSnapshot?: () => ConversationLayout;
  requestPaneClose?: (paneId: string) => boolean;
  requestPaneNavigate?: (viewId: string, channelId: string) => boolean;
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
window.__BUZZ_E2E__ = {
  mode: "mock",
  mock: new URLSearchParams(location.search).has("routing")
    ? {
        sendMessageDelayMs: 1200,
        deferredComposerUploads: true,
        uploadDescriptors: [
          {
            url: `https://mock.relay/media/${"a".repeat(64)}.pdf`,
            sha256: "a".repeat(64),
            size: 15,
            type: "application/pdf",
            uploaded: Math.floor(Date.now() / 1000),
            filename: "routing-receipt.pdf",
          },
        ],
      }
    : undefined,
};
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
      markThreadReplySeen: (
        ...args: Parameters<typeof base.markThreadReplySeen>
      ) => {
        harnessWindow.hostReads.push({
          view: id,
          kind: "seen",
          id: `${args[0]}:${args[1]}`,
        });
        base.markThreadReplySeen(...args);
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
  const guards = React.useContext(ConversationViewGuardsContext);
  const [focusRequest, setFocusRequest] = React.useState<{
    viewId: string;
    sequence: number;
  }>();
  const focusSequence = React.useRef(0);
  const [controller] = React.useState(() => {
    const scope = {
      communityId: "fixture",
      identityPubkey: identity.pubkey,
      windowSlot: "main",
    };
    const entries = new Map<string, string>();
    const makeController = (layout: ReturnType<typeof createSingleLayout>) => {
      entries.set(layoutStorageKey(scope), JSON.stringify(layout));
      return new ConversationLayoutController({
        scope,
        storage: {
          getItem: (key) => entries.get(key) ?? null,
          setItem: (key, value) => {
            entries.set(key, value);
          },
        },
        initialChannelId: channel?.id ?? "missing",
        isCurrentScope: () => true,
        canOpen: (id) =>
          fixtureChannels.some(
            (value) =>
              value.id === id &&
              (value.channelType === "stream" || value.channelType === "dm"),
          ),
        canLeave: (view) => guards?.allow(view.id) ?? false,
      });
    };
    const view = {
      ...createConversationView(channel?.id ?? "missing"),
      id: "a",
      panelState: { thread: rootA },
    };
    const initial = createSingleLayout(view, (kind) => `${kind}-a`);
    if (dragFixture || new URLSearchParams(location.search).has("single"))
      return makeController(initial);
    return makeController(
      focusPane(
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
      ),
    );
  });
  const state = React.useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  const layout = state.layout;
  React.useEffect(() => () => controller.dispose(), [controller]);
  const surfaceRef = React.useRef<HTMLDivElement>(null);
  const bounds = () =>
    surfaceRef.current?.getBoundingClientRect() ?? { width: 0, height: 0 };
  const requestHeader = () => {
    const next = controller.getSnapshot().layout;
    const pane = listPanes(next.root).find(
      (value) => value.id === next.focusedPaneId,
    );
    if (pane)
      setFocusRequest({
        viewId: pane.viewInstanceId,
        sequence: ++focusSequence.current,
      });
  };
  harnessWindow.layoutSnapshot = () => layout;
  harnessWindow.requestPaneClose = (paneId) => controller.close(paneId);
  harnessWindow.requestPaneNavigate = (viewId, channelId) =>
    controller.navigate(viewId, channelId);
  return (
    <div className="flex h-full min-h-0 min-w-0">
      {dragFixture && (
        <FixtureDragSidebar
          channels={fixtureChannels}
          onEvent={(event) => harnessWindow.dragEvents?.push(event)}
        />
      )}
      <div ref={surfaceRef} className="min-h-0 min-w-0 flex-1">
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
                    harnessWindow.dragEvents?.push({ type: "canvas", ...drop });
                    if (
                      controller.open(
                        drop.paneId,
                        drop.channelId,
                        drop.edge === "right" ? "horizontal" : "vertical",
                        bounds(),
                        window.innerWidth,
                      )
                    )
                      requestHeader();
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
          onFocusPane={(id) => controller.focus(id)}
          onResize={(id, sizes, commit) => controller.resize(id, sizes, commit)}
          canRestore={state.canRestore}
          onCommand={(paneId, command) => {
            const panes = listPanes(layout.root);
            const pane = panes.find((value) => value.id === paneId);
            if (!pane) return;
            if (command === "splitRight" || command === "splitBottom") {
              if (
                controller.open(
                  paneId,
                  layout.views[pane.viewInstanceId].channelId,
                  command === "splitRight" ? "horizontal" : "vertical",
                  bounds(),
                  window.innerWidth,
                )
              )
                requestHeader();
            } else if (command === "swap" && panes.length === 2)
              controller.swap(panes[0].id, panes[1].id);
            else if (command === "horizontal" || command === "vertical")
              controller.orient(command, bounds(), window.innerWidth);
            else if (command === "close" || command === "closeSplit") {
              if (controller.close(paneId, command === "closeSplit"))
                requestHeader();
            } else if (command === "restore") {
              if (controller.restore()) requestHeader();
            }
          }}
          renderPane={({ view, pane, focused, visible, headerEndActions }) => {
            const visit = controller.visitToken(view.id);
            return (
              <PerViewShell id={view.id}>
                <ConversationViewHost
                  viewInstanceId={view.id}
                  focused={focused}
                  visible={visible}
                  label={`General ${view.id}`}
                  initialPanelState={view.panelState}
                  onPanelNavigate={(patch) =>
                    controller.update(view.id, view.channelId, visit, {
                      panelState: patch,
                    })
                  }
                  onFocusView={() => controller.focus(pane.id)}
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
            );
          }}
        />
      </div>
    </div>
  );
}
function Screen() {
  const [guards] = React.useState(() => new ConversationViewGuards());
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
  harnessWindow.hostSeen = (rootId, replyId) =>
    resolveThreadReplySeenAt(rootId, replyId, read.getOwnTimestamp);
  const [focused, setFocused] = React.useState("a");
  const [showA, setShowA] = React.useState(true);
  const shell = React.useMemo(
    () => ({
      ...fallback,
      registerContextParents: read.registerContextParents,
      readStateVersion: read.readStateVersion,
      getChannelReadAt: read.getEffectiveTimestamp,
      getThreadReplySeenAt: (rootId: string, replyId: string) =>
        resolveThreadReplySeenAt(rootId, replyId, read.getOwnTimestamp),
      markThreadReplySeen: (rootId: string, replyId: string, at: number) => {
        read.seedContextRead(threadReplySeenKey(rootId, replyId), at);
        read.seedContextRead(threadSeenKey(rootId), at);
      },
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
      read.getOwnTimestamp,
      read.seedContextRead,
    ],
  );
  return (
    <AppShellProvider value={shell}>
      <ConversationViewGuardsContext.Provider value={guards}>
        <ConversationDraftEditorsProvider>
          <Toaster />
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
      </ConversationViewGuardsContext.Provider>
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

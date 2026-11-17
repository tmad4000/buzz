// Synthetic browser harness exercising production navigation and read hooks.
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { AppShellProvider } from "@/app/AppShellContext";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { useChannelOpenReadState } from "@/features/channels/ui/useChannelOpenReadState";
import { useChannelPanelHistoryState } from "@/features/channels/ui/useChannelPanelHistoryState";
import { HistorySearchScopeProvider } from "@/shared/hooks/HistorySearchScope";

declare global {
  interface Window {
    isolationReads: string[];
    isolationArrival: () => void;
  }
}
window.isolationReads = [];
const inbox: never[] = [];
function Panel({ id, at }: { id: string; at: string }) {
  const panel = useChannelPanelHistoryState();
  useChannelOpenReadState("same-channel", true, at);
  return (
    <>
      <h2>Same channel · view {id}</h2>
      <output data-thread={id}>{panel.openThreadHeadId ?? "closed"}</output>
      <button
        type="button"
        onClick={() => panel.setOpenThreadHeadId(`root-${id}`)}
      >
        Open thread {id}
      </button>
      <button type="button" onClick={() => panel.setOpenThreadHeadId(null)}>
        Close thread {id}
      </button>
    </>
  );
}
function Screen() {
  const [focused, setFocused] = React.useState("a");
  const [showA, setShowA] = React.useState(true);
  const [at, setAt] = React.useState("2026-11-16T00:00:00Z");
  window.isolationArrival = () => setAt((previous) => `${previous}1`);
  const shells = React.useMemo(
    () =>
      Object.fromEntries(
        ["a", "b"].map((id) => [
          id,
          {
            feedItemState: { undoUnread: () => {} },
            locallyUnreadFeedItems: inbox,
            markChannelRead: () => window.isolationReads.push(id),
          },
        ]),
      ),
    [],
  );
  return (
    <main>
      <h1>Buzz Ideaflow · isolation regression</h1>
      <button
        type="button"
        onClick={() => {
          setShowA(false);
          setFocused("b");
        }}
      >
        Unmount view a
      </button>
      <div style={{ display: "flex", gap: 24 }}>
        {["a", "b"]
          .filter((id) => id !== "a" || showA)
          .map((id) => (
            <section
              key={id}
              aria-label={`Conversation ${id}`}
              onPointerDown={() => setFocused(id)}
              onFocusCapture={() => setFocused(id)}
              style={{
                padding: 24,
                border: `2px solid ${focused === id ? "blue" : "gray"}`,
              }}
            >
              <AppShellProvider value={shells[id] as never}>
                <ConversationViewContext.Provider
                  value={{
                    viewInstanceId: id,
                    focused: focused === id,
                    visible: true,
                  }}
                >
                  <HistorySearchScopeProvider>
                    <Panel id={id} at={at} />
                  </HistorySearchScopeProvider>
                </ConversationViewContext.Provider>
              </AppShellProvider>
            </section>
          ))}
      </div>
    </main>
  );
}
const router = createRouter({
  routeTree: createRootRoute({ component: Screen }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
const root = document.getElementById("root");
if (root) createRoot(root).render(<RouterProvider router={router} />);

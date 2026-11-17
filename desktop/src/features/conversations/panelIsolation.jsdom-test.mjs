import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { HistorySearchScopeProvider } from "@/shared/hooks/HistorySearchScope";
import { useChannelPanelHistoryState } from "@/features/channels/ui/useChannelPanelHistoryState";

test("duplicate views keep independent thread and auxiliary state through sibling unmount", async () => {
  const states = {};
  const navigations = [];
  function Host({ id }) {
    states[id] = useChannelPanelHistoryState();
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let setIncludeA;
  function Screen() {
    const [includeA, setValue] = React.useState(true);
    setIncludeA = setValue;
    return ["a", "b"]
      .filter((id) => includeA || id !== "a")
      .map((id) =>
        React.createElement(
          HistorySearchScopeProvider,
          {
            key: id,
            initialValues: { thread: "seed" },
            onNavigate: (patch, options) =>
              navigations.push({ id, patch, options }),
          },
          React.createElement(Host, { id }),
        ),
      );
  }
  const router = createRouter({
    routeTree: createRootRoute({ component: Screen }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  try {
    await act(() =>
      root.render(React.createElement(RouterProvider, { router })),
    );
    await act(async () => {
      states.a.setOpenThreadHeadId("root-a");
      states.b.setOpenThreadHeadId("root-b");
    });
    await act(async () => states.a.openProfilePanel("alice"));
    assert.equal(states.a.openThreadHeadId, "root-a");
    assert.equal(states.b.openThreadHeadId, "root-b");
    assert.equal(states.b.profilePanelPubkey, null);
    await act(async () => states.a.setOpenThreadHeadId(null));
    assert.equal(states.b.openThreadHeadId, "root-b");
    await act(() => setIncludeA(false));
    assert.equal(states.b.openThreadHeadId, "root-b");
    await act(async () => states.b.setOpenThreadHeadId("still-live"));
    assert.equal(states.b.openThreadHeadId, "still-live");
    navigations.length = 0;
    await act(async () => {
      states.b.setOpenAgentSessionPubkey("agent");
      states.b.setOpenAgentSessionChannelId("general", { replace: true });
    });
    assert.deepEqual(navigations, [
      {
        id: "b",
        patch: { agentSession: "agent", agentSessionChannel: "general" },
        options: { replace: true },
      },
    ]);
    navigations.length = 0;
    await act(async () => states.b.setOpenAgentSessionPubkey("agent"));
    assert.deepEqual(navigations, []);
    assert.equal(router.history.location.search, "");
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

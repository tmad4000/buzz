import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useConversationIncomingRoute } from "./useConversationIncomingRoute.ts";
import { conversationRouteProjection } from "./routeProjection.ts";
import { projectionEchoesFor } from "./projectionEchoes.ts";
import { admittedRouteSearchHighlight } from "./routeSearchHighlight.ts";

test("true projection echo preserves A; explicit same-message route with copied metadata clears only A", async () => {
  const a = { id: "a", channelId: "chat", panelState: { messageId: "m" } };
  const b = {
    id: "b",
    channelId: "chat",
    panelState: { messageId: "sibling" },
  };
  const layout = {
    root: {
      kind: "group",
      children: [
        { kind: "pane", id: "pa", viewInstanceId: "a" },
        { kind: "pane", id: "pb", viewInstanceId: "b" },
      ],
    },
    focusedPaneId: "pa",
    views: { a, b },
  };
  let navigations = 0;
  // Controlled port isolates the production hook's origin classification; the
  // separate controller tests own navigation/guard/cache behavior.
  const controller = {
    getSnapshot: () => ({ layout }),
    navigateRoute: () => {
      navigations++;
      return "a";
    },
  };
  const session = { scopeKey: "scope", controller };
  const highlights = {
    a: { activationId: "a-search" },
    b: { activationId: "b-search" },
  };
  const originalA = highlights.a,
    originalB = highlights.b;
  const echoState = conversationRouteProjection(
    a,
    "scope",
    true,
    "nonce",
  ).state({});
  echoState.__TSR_key = "outgoing-entry";
  const echoes = projectionEchoesFor(controller);
  echoes.expect(
    "nonce",
    {
      scopeKey: "scope",
      viewId: "a",
      channelId: "chat",
      panelState: a.panelState,
    },
    {},
  );
  echoes.bindHistoryEntry("nonce", "outgoing-entry");
  function Harness({ route }) {
    useConversationIncomingRoute({
      session,
      active: true,
      route,
      visibleViewIds: new Set(["a", "b"]),
      recentViewIds: ["a", "b"],
      onRejected: () => assert.fail("unexpected veto"),
      onAdmitted: (id, incoming, options) => {
        const value = admittedRouteSearchHighlight(
          incoming,
          layout.views[id].channelId,
          options.projectionEcho,
        );
        if (value !== undefined) highlights[id] = value;
      },
    });
    return null;
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (key, state) =>
    act(() =>
      root.render(
        React.createElement(Harness, {
          route: {
            key,
            channelId: "chat",
            search: { messageId: "m" },
            state,
          },
        }),
      ),
    );
  try {
    await render("projection", echoState);
    assert.equal(navigations, 0);
    assert.equal(highlights.a, originalA);
    await render("explicit-plain", {
      ...echoState,
      __TSR_key: "explicit-entry",
      searchHighlight: null,
    });
    assert.equal(navigations, 1);
    assert.equal(highlights.a, null);
    assert.equal(highlights.b, originalB);
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

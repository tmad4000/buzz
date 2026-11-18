import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RouterContextProvider } from "@tanstack/react-router";
import { ConversationAutoSubmitCommands } from "./autoSubmitCommands.ts";
import { DraftEditorCoordinator } from "./draftEditorCoordinator.ts";
import {
  autoSendPermitsFor,
  withAutoSendPermitState,
} from "./autoSendNavigation.ts";
import { useConversationAutoSendRouteCommand } from "./useConversationAutoSendRouteCommand.ts";

async function fixture({
  endpoint = true,
  ownerView = "a",
  deferred = false,
} = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const focus = document.hasFocus;
  const visibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const historyListeners = new Set(),
    viewListeners = new Set();
  const history = {
    location: null,
    subscribe: (listener) => {
      historyListeners.add(listener);
      return () => historyListeners.delete(listener);
    },
  };
  const layout = {
    root: { kind: "pane", id: "pane", viewInstanceId: "a" },
    focusedPaneId: "pane",
    views: {
      a: { id: "a", channelId: "chat", panelState: { thread: "root" } },
    },
  };
  const controller = {
    getSnapshot: () => ({ layout }),
    visitToken: () => 1,
    subscribe: (listener) => {
      viewListeners.add(listener);
      return () => viewListeners.delete(listener);
    },
  };
  const session = { scopeKey: "scope", controller };
  const coordinator = new DraftEditorCoordinator();
  const stopOwner = coordinator.register(
    "thread:root",
    `${ownerView}-editor`,
    () => true,
  );
  const commands = new ConversationAutoSubmitCommands({
    scopeKey: "scope",
    ownerForDraft: (key) => coordinator.owner(key),
    isCurrent: (target) => target.viewId === "a",
  });
  const scopeRef = {
    current: {
      scopeKey: "scope",
      coordinator,
      commands,
      visitForView: () => 1,
    },
  };
  const permits = autoSendPermitsFor(history),
    stopScope = permits.bindScope("scope", () => true);
  const sent = [];
  let replacements = 0,
    settle;
  const router = {
    options: {},
    state: { location: null },
    history,
    navigate: async (projection) => {
      replacements++;
      const search = projection.search;
      const query = new URLSearchParams(
        Object.entries(search).filter(([, v]) => v !== undefined),
      );
      const location = {
        href: `/channels/chat?${query}#anchor`,
        hash: "anchor",
        search,
        state: {
          ...projection.state(history.location.state),
          __TSR_key: `clear-${replacements}`,
        },
      };
      emit(location, "REPLACE");
      if (deferred)
        await new Promise((resolve) => {
          settle = resolve;
        });
    },
  };
  function emit(location, type) {
    history.location = location;
    router.state.location = location;
    for (const listener of [...historyListeners])
      listener({ location, action: { type } });
  }
  function register() {
    return commands.register({
      target: {
        scopeKey: "scope",
        viewId: ownerView,
        channelId: "chat",
        visit: 1,
        draftKey: "thread:root",
        ownerId: `${ownerView}-editor`,
      },
      admit: () => true,
      submit: async () => {
        sent.push("delegated");
      },
    });
  }
  let stopEndpoint = endpoint ? register() : () => {};
  let api;
  function Harness() {
    api = useConversationAutoSendRouteCommand({
      session,
      active: true,
      scopeRef,
    });
    return null;
  }
  await act(() =>
    root.render(
      React.createElement(
        RouterContextProvider,
        { router },
        React.createElement(Harness),
      ),
    ),
  );
  function incoming() {
    const token = permits.arm("chat", "thread:root");
    const location = {
      href: "/channels/chat?thread=root&autoSend=thread%3Aroot#anchor",
      hash: "anchor",
      search: { thread: "root", autoSend: "thread:root" },
      state: withAutoSendPermitState(
        { __TSR_key: `entry-${crypto.randomUUID()}` },
        token,
      ),
    };
    emit(location, "PUSH");
    assert.equal(
      permits.bindEntry(token, {
        action: "PUSH",
        key: location.state.__TSR_key,
        channelId: "chat",
        draftKey: "thread:root",
      }),
      true,
    );
    return {
      key: JSON.stringify([location.state.__TSR_key, location.href]),
      channelId: "chat",
      search: location.search,
      state: location.state,
      freshNavigation: true,
    };
  }
  return {
    get api() {
      return api;
    },
    sent,
    coordinator,
    history,
    historyListeners,
    viewListeners,
    incoming,
    emit,
    replacements: () => replacements,
    settle: () => settle?.(),
    register: () => {
      stopEndpoint = register();
    },
    close: async () => {
      await act(() => root.unmount());
      settle?.();
      stopEndpoint();
      commands.dispose();
      stopOwner();
      stopScope();
      assert.equal(historyListeners.size, 0);
      assert.equal(viewListeners.size, 0);
      document.hasFocus = focus;
      if (visibility)
        Object.defineProperty(document, "visibilityState", visibility);
      else delete document.visibilityState;
      container.remove();
    },
  };
}
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

test("actual issuer hook consumes confirmation once, clears first and delegates only once", async () => {
  const h = await fixture();
  try {
    const route = h.incoming();
    await act(() => h.api.admitted("a", route, false));
    await flush();
    assert.deepEqual(h.sent, ["delegated"]);
    assert.equal(h.replacements(), 1);
    assert.equal(h.history.location.search.autoSend, undefined);
    assert.equal(h.history.location.search.thread, "root");
    await act(() => h.api.admitted("a", route, false));
    await flush();
    assert.equal(h.sent.length, 1);
    assert.equal(h.replacements(), 1);
  } finally {
    await h.close();
  }
});

test("missing/preview endpoint and vetoed/cold routes stay manual without mount retry", async () => {
  for (const mode of ["missing", "preview", "veto", "cold"]) {
    const h = await fixture({
      endpoint: mode !== "missing",
      ownerView: mode === "preview" ? "b" : "a",
    });
    try {
      const route = h.incoming();
      if (mode === "veto") h.api.rejected(route);
      await act(() =>
        h.api.admitted(
          "a",
          mode === "cold" ? { ...route, freshNavigation: false } : route,
          false,
        ),
      );
      await flush();
      assert.equal(h.sent.length, 0);
      assert.equal(h.replacements(), 0);
      assert.ok(h.api.notice);
      if (mode === "missing") {
        h.register();
        await flush();
        assert.equal(h.sent.length, 0);
      }
      await act(() => h.api.admitted("a", route, false));
      await flush();
      assert.equal(h.sent.length, 0);
    } finally {
      await h.close();
    }
  }
});

test("ownership interruption before the commit opportunity never resumes on takeover back", async () => {
  const h = await fixture();
  const stopOther = h.coordinator.register(
    "thread:root",
    "b-editor",
    () => true,
  );
  try {
    const route = h.incoming();
    await act(() => {
      h.api.admitted("a", route, false);
      assert.equal(h.coordinator.takeOver("thread:root", "b-editor"), true);
      assert.equal(h.coordinator.takeOver("thread:root", "a-editor"), true);
    });
    await flush();
    assert.equal(h.sent.length, 0);
    assert.equal(h.replacements(), 0);
  } finally {
    stopOther();
    await h.close();
  }
});

test("a second replace with copied clear metadata retires while clearing", async () => {
  const h = await fixture({ deferred: true });
  try {
    const route = h.incoming();
    await act(() => h.api.admitted("a", route, false));
    await flush();
    assert.equal(h.replacements(), 1);
    const clear = h.history.location;
    h.emit(
      { ...clear, state: { ...clear.state, __TSR_key: "copied-replace" } },
      "REPLACE",
    );
    await act(async () => {
      h.settle();
    });
    await flush();
    assert.equal(h.sent.length, 0);
    assert.ok(h.api.notice);
  } finally {
    await h.close();
  }
});

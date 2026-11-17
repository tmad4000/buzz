import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ConversationViewContext,
  useConversationControlScope,
} from "./ConversationViewContext.tsx";
import { useEscapeKey } from "@/shared/hooks/useEscapeKey";
import { useFocusDrawerPresence } from "@/features/channels/ui/useFocusDrawerPresence";
import { requestFocusedThreadClose } from "@/features/channels/focusedThreadCloseRequest";
import {
  ThreadViewModeScopeProvider,
  useThreadViewMode,
  useSetThreadViewMode,
  getThreadViewMode,
  setThreadViewMode,
} from "@/features/channels/lib/threadViewModePreference";

async function harness(run) {
  const visibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  const hasFocus = document.hasFocus;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.hasFocus = () => true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const api = {};
  const escaped = [];
  const closed = [];
  const initialPreference = getThreadViewMode();
  function Probe({ id }) {
    const scope = useConversationControlScope();
    const mode = useThreadViewMode();
    const setMode = useSetThreadViewMode();
    useEscapeKey(() => escaped.push(id));
    useFocusDrawerPresence(true, () => closed.push(id));
    api[id] = { ...scope, mode, setMode };
    return React.createElement(
      "button",
      { type: "button", "data-target": true },
      id,
    );
  }
  function Host({ id, focused, visible, probeA }) {
    const rootRef = React.useRef(null);
    return React.createElement(
      "section",
      {
        ref: rootRef,
        hidden: !visible,
        "data-focused-conversation": focused || undefined,
      },
      React.createElement(
        ConversationViewContext.Provider,
        { value: { viewInstanceId: id, focused, visible, rootRef } },
        React.createElement(
          ThreadViewModeScopeProvider,
          { initialMode: "split" },
          id !== "a" || probeA ? React.createElement(Probe, { id }) : null,
        ),
      ),
    );
  }
  const render = async (focused, visible = true, probeA = true) =>
    act(() =>
      root.render(
        ["a", "b"].map((id) =>
          React.createElement(Host, {
            key: id,
            id,
            focused: id === focused,
            visible,
            probeA,
          }),
        ),
      ),
    );
  try {
    await render("a");
    await run({ api, escaped, closed, render, container });
  } finally {
    await act(() => root.unmount());
    container.remove();
    document.hasFocus = hasFocus;
    if (visibility)
      Object.defineProperty(document, "visibilityState", visibility);
    else delete document.visibilityState;
    setThreadViewMode(initialPreference);
  }
}

test("Escape and external drawer dismissal target only focused visible view; callbacks recheck focus", async () =>
  harness(async ({ api, escaped, closed, render }) => {
    const staleA = api.a.canHandle;
    await act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    );
    await act(() => requestFocusedThreadClose());
    assert.deepEqual(escaped, ["a"]);
    assert.deepEqual(closed, ["a"]);
    await render("b");
    assert.equal(staleA(), false);
    await act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    );
    await act(() => requestFocusedThreadClose());
    assert.deepEqual(escaped, ["a", "b"]);
    assert.deepEqual(closed, ["a", "b"]);
    await render("b", false);
    await act(() => requestFocusedThreadClose());
    assert.equal(api.b.canHandle(), false);
    assert.deepEqual(closed, ["a", "b"]);
  }));

test("DOM lookup stays inside owning pane; stale focus/unmounted/background callbacks cannot target siblings", async () => {
  let staleQuery;
  await harness(async ({ api, render }) => {
    assert.equal(api.a.query("[data-target]").textContent, "a");
    assert.equal(api.b.query("[data-target]"), null);
    staleQuery = api.a.query;
    await render("b");
    assert.equal(staleQuery("[data-target]"), null);
    assert.equal(api.b.query("[data-target]").textContent, "b");
    document.hasFocus = () => false;
    assert.equal(api.b.query("[data-target]"), null);
    assert.equal(api.b.canRestoreFocus(), false);
  });
  assert.equal(staleQuery("[data-target]"), null);
});

test("thread presentation mode is independent per duplicate view and does not overwrite device preference", async () =>
  harness(async ({ api }) => {
    const preference = getThreadViewMode();
    await act(() => api.a.setMode("focus"));
    assert.equal(api.a.mode, "focus");
    assert.equal(api.b.mode, "split");
    assert.equal(getThreadViewMode(), preference);
    await act(() => setThreadViewMode("focus"));
    assert.equal(api.b.mode, "split");
  }));

test("closing drawer restoration reads live host focus after child teardown and before deferred focus", async () =>
  harness(async ({ api, render }) => {
    const restore = api.a.canRestoreFocus;
    assert.equal(restore(), true);
    await render("a", true, false);
    assert.equal(
      restore(),
      true,
      "closing child can restore inside its still-active host",
    );
    await render("b", true, false);
    assert.equal(
      restore(),
      false,
      "unmounted child cannot reclaim focus after sibling activation",
    );
    await render("a", false, false);
    assert.equal(
      restore(),
      false,
      "unmounted child cannot restore into compact-hidden host",
    );
  }));

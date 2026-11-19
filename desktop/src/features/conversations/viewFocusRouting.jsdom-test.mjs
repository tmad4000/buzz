import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { useNavigationGuard } from "@/features/channels/ui/useNavigationGuard";
import { allowNavigation } from "@/app/navigation/navigationGuard";
import { useComposerAutofocus } from "@/features/messages/lib/useComposerAutofocus";

test("only the focused visible view guards navigation and pane composers never steal mount focus", async () => {
  const guarded = [];
  const autofocus = [];
  const guardA = () => {
    guarded.push("a");
    return true;
  };
  const guardB = () => {
    guarded.push("b");
    return false;
  };
  const focusA = () => autofocus.push("a");
  const focusB = () => autofocus.push("b");
  function Host({ id }) {
    useNavigationGuard(id === "a" ? guardA : guardB);
    useComposerAutofocus(id === "a" ? focusA : focusB, "same-draft", false);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  const render = (focused) =>
    act(async () =>
      root.render(
        ["a", "b"].map((id) =>
          React.createElement(
            ConversationViewContext.Provider,
            {
              key: id,
              value: {
                viewInstanceId: id,
                focused: id === focused,
                visible: true,
              },
            },
            React.createElement(Host, { id }),
          ),
        ),
      ),
    );
  try {
    await render("a");
    assert.equal(allowNavigation({ kind: "history", direction: "back" }), true);
    assert.deepEqual(guarded, ["a"]);
    await render("b");
    assert.equal(
      allowNavigation({ kind: "history", direction: "back" }),
      false,
    );
    assert.deepEqual(guarded, ["a", "b"]);
    assert.deepEqual(autofocus, []);
  } finally {
    await act(() => root.unmount());
  }
  assert.equal(allowNavigation({ kind: "history", direction: "back" }), true);
});

test("restart consults the unfocused mounted pane without changing focused navigation behavior", async () => {
  const { allowAppRestart } = await import("@/shared/lib/appRestartGuard");
  function Host({ dirty }) {
    useNavigationGuard(() => !dirty);
    return null;
  }
  const root = createRoot(document.createElement("div"));
  try {
    await act(() =>
      root.render(
        [false, true].map((dirty, i) =>
          React.createElement(
            ConversationViewContext.Provider,
            {
              key: i,
              value: {
                viewInstanceId: String(i),
                focused: i === 0,
                visible: true,
              },
            },
            React.createElement(Host, { dirty }),
          ),
        ),
      ),
    );
    assert.equal(allowNavigation({ kind: "history", direction: "back" }), true);
    assert.equal(
      allowAppRestart(),
      false,
      "unfocused dirty editor must veto whole-app restart",
    );
  } finally {
    await act(() => root.unmount());
  }
  assert.equal(allowAppRestart(), true, "unmount removes only its guards");
});

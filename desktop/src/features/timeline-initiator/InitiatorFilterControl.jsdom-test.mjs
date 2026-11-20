import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { InitiatorFilterControl } from "./InitiatorFilterControl.tsx";
import { useInitiatorKeyDown } from "./useInitiatorKeyDown.ts";

test("the focused channel cycles the visible filter without intercepting editors or IME", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  function Surface() {
    const [filter, setFilter] = useState("all");
    const onKeyDown = useInitiatorKeyDown({
      filter,
      setFilter,
      evidence: { roots: new Map(), loadedAgentReplies: new Map() },
    });
    return createElement(
      "section",
      { onKeyDown },
      createElement(InitiatorFilterControl, {
        value: filter,
        onChange: setFilter,
      }),
      createElement("button", { type: "button" }, "Timeline row"),
      createElement("textarea", { "aria-label": "Composer" }),
    );
  }
  const render = (focused) =>
    act(() =>
      root.render(
        createElement(
          ConversationViewContext.Provider,
          {
            value: { focused, visible: true, viewInstanceId: "one" },
          },
          createElement(Surface),
        ),
      ),
    );
  const send = async (target, extra = {}) => {
    const event = new window.KeyboardEvent("keydown", {
      key: "Y",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
      ...extra,
    });
    await act(() => target.dispatchEvent(event));
    return event.defaultPrevented;
  };
  try {
    await render(true);
    const row = container.querySelector("button");
    const select = container.querySelector("select");
    row.focus();
    assert.equal(await send(row), true);
    assert.equal(select.value, "mine");
    assert.equal(document.activeElement, row);
    assert.equal(await send(container.querySelector("textarea")), false);
    assert.equal(await send(row, { isComposing: true }), false);
    assert.equal(select.value, "mine");
    assert.equal(await send(row), true);
    assert.equal(select.value, "agents");
    await render(false);
    assert.equal(await send(row), false);
    assert.equal(select.value, "agents");
    await act(() => {
      select.value = "all";
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(select.value, "all");
  } finally {
    await act(() => root.unmount());
    container.remove();
    globalThis.requestAnimationFrame = previousRaf;
  }
});

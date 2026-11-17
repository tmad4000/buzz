import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import {
  ConversationViewGuards,
  ConversationViewGuardsContext,
  useConversationLeaveGuard,
} from "./ConversationViewGuards.tsx";
import { useNavigationGuard } from "@/features/channels/ui/useNavigationGuard";
import { allowNavigation } from "@/app/navigation/navigationGuard";
import { ConversationLayoutController } from "./layout/controller.ts";
import { listPanes } from "./layout/model.ts";

test("background target close/replace runs its live guard; global navigation checks focused view's complete guard set", async () => {
  const guards = new ConversationViewGuards();
  let sequence = 0;
  const controller = new ConversationLayoutController({
    scope: { communityId: "c", identityPubkey: "i", windowSlot: "w" },
    storage: { getItem: () => null, setItem() {} },
    initialChannelId: "chat",
    ids: (kind) => `${kind}-${++sequence}`,
    isCurrentScope: () => true,
    canOpen: () => true,
    canLeave: (view) => guards.allow(view.id),
  });
  const a = listPanes(controller.getSnapshot().layout.root)[0];
  controller.open(
    a.id,
    "chat",
    "horizontal",
    { width: 1000, height: 800 },
    1440,
  );
  const b = listPanes(controller.getSnapshot().layout.root)[1];
  const seen = [];
  const root = createRoot(document.createElement("div"));
  function Guard({ id, blocked, pageBlocked }) {
    useNavigationGuard(() => {
      seen.push(`${id}:edit`);
      return !blocked;
    });
    useConversationLeaveGuard(() => {
      seen.push(`${id}:page`);
      return !pageBlocked;
    });
    return null;
  }
  const render = (
    blockedA = false,
    blockedB = false,
    pageBlockedB = false,
    showA = true,
  ) =>
    act(() =>
      root.render(
        React.createElement(
          ConversationViewGuardsContext.Provider,
          { value: guards },
          [a, b]
            .filter((pane) => showA || pane !== a)
            .map((pane) =>
              React.createElement(
                ConversationViewContext.Provider,
                {
                  key: pane.id,
                  value: {
                    viewInstanceId: pane.viewInstanceId,
                    focused: pane === b,
                    visible: pane === b,
                  },
                },
                React.createElement(Guard, {
                  id: pane === a ? "a" : "b",
                  blocked: pane === a ? blockedA : blockedB,
                  pageBlocked: pane === b && pageBlockedB,
                }),
              ),
            ),
        ),
      ),
    );
  try {
    await render(true, false);
    assert.equal(controller.close(a.id), false);
    assert.deepEqual(seen, ["a:edit"]);
    seen.length = 0;
    assert.equal(allowNavigation({ kind: "history", direction: "back" }), true);
    assert.deepEqual(seen, ["b:edit", "b:page"]);
    await render(false, false, true);
    assert.equal(controller.navigate(b.viewInstanceId, "dm"), false);
    assert.equal(allowNavigation({ kind: "route", href: "/" }), false);
    await render(false, false, false, false);
    assert.equal(
      guards.allow(a.viewInstanceId),
      true,
      "unmounted guards released",
    );
    assert.equal(controller.navigate(b.viewInstanceId, "dm"), true);
    assert.equal(controller.close(a.id), true);
  } finally {
    await act(() => root.unmount());
    controller.dispose();
  }
  assert.equal(allowNavigation({ kind: "history", direction: "back" }), true);
});

test("guard registration lifetime/reentrancy is scoped; stale cleanup cannot remove a replacement", () => {
  const first = new ConversationViewGuards();
  const second = new ConversationViewGuards();
  const remove = first.register("a", () => false);
  assert.equal(second.allow("a"), true);
  const replacement = first.register("a", () => true);
  remove();
  remove();
  assert.equal(first.allow("a"), true);
  replacement();
  let cleanup;
  cleanup = first.register("a", () => {
    cleanup();
    first.register("a", () => false);
    return true;
  });
  assert.equal(first.allow("a"), false);
  assert.equal(first.allow("a"), false);
});

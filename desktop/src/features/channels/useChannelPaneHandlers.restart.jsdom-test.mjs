import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChannelPaneHandlers } from "./useChannelPaneHandlers.ts";
import { useNavigationGuard } from "./ui/useNavigationGuard.ts";
import { ConversationViewContext } from "../conversations/ConversationViewContext.tsx";
import { allowNavigation } from "@/app/navigation/navigationGuard";
import { allowAppRestart } from "@/shared/lib/appRestartGuard";
import { explicitUpdate } from "../settings/hooks/explicitUpdate.ts";

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function fixture() {
  const views = new Map();
  const saves = [];
  let saveGate = Promise.resolve();
  function Pane({ id }) {
    const [editTargetId, setEditTargetId] = React.useState(null);
    const [pending, setPending] = React.useState(false);
    const handlers = useChannelPaneHandlers({
      editTargetId,
      setEditTargetId,
      editTargetIsThreadReply: false,
      editMessageMutation: {
        isPending: pending,
        mutateAsync: async (input) => {
          saves.push(input);
          setPending(true);
          try {
            await saveGate;
          } finally {
            setPending(false);
          }
        },
      },
      deleteMessageMutation: { mutateAsync: assert.fail },
      toggleReactionMutation: { mutateAsync: assert.fail },
      sendMessageMutation: { mutateAsync: assert.fail },
      expandedThreadReplyIds: new Set(),
      profiles: {},
      getFirstReplyIdForMessage: () => null,
      getReplyDescendantIdsForMessage: () => [],
      markRevealedRepliesRead: assert.fail,
      recordThreadInteraction: assert.fail,
      onOptimisticOpenThreadHeadIdChange: assert.fail,
      onRequestEmptyEditDelete: assert.fail,
      openThreadHeadId: null,
      threadReplyTargetId: null,
      setExpandedThreadReplyIds: assert.fail,
      setOpenThreadHeadId: assert.fail,
      setThreadReplyTargetId: () => {},
      setThreadScrollTargetId: assert.fail,
    });
    useNavigationGuard(handlers.requireThreadEditResolution);
    views.set(id, { ...handlers, editTargetId, pending });
    return React.createElement("div", {
      "data-pane": id,
      "data-edit-target": editTargetId ?? "",
    });
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(() =>
    root.render(
      ["background", "focused"].map((id) =>
        React.createElement(
          ConversationViewContext.Provider,
          {
            key: id,
            value: {
              viewInstanceId: id,
              focused: id === "focused",
              visible: true,
            },
          },
          React.createElement(Pane, { id }),
        ),
      ),
    ),
  );
  return {
    views,
    saves,
    gate: (p) => {
      saveGate = p;
    },
    close: async () => {
      await act(() => root.unmount());
      container.remove();
      assert.equal(allowAppRestart(), true);
    },
  };
}

test("real main-message edit in an unfocused pane vetoes restart without broadening thread navigation", async () => {
  const f = await fixture();
  try {
    await act(() =>
      f.views.get("background").handleEdit({ id: "main-timeline-message" }),
    );
    assert.equal(
      f.views.get("background").editTargetId,
      "main-timeline-message",
    );
    assert.equal(f.views.get("background").requireThreadEditResolution(), true);
    assert.equal(allowNavigation({ kind: "history", direction: "back" }), true);
    assert.equal(allowAppRestart(), false);
    await act(() => f.views.get("background").handleCancelEdit());
    assert.equal(allowAppRestart(), true);
  } finally {
    await f.close();
  }
});

test("pending real main-edit save vetoes even if selection is cleared until mutation finishes", async () => {
  const f = await fixture();
  const gate = deferred();
  f.gate(gate.promise);
  try {
    await act(() => f.views.get("background").handleEdit({ id: "main-save" }));
    let saving;
    await act(() => {
      saving = f.views.get("background").handleEditSave("edited text");
    });
    assert.equal(f.views.get("background").pending, true);
    assert.equal(f.saves[0].eventId, "main-save");
    await act(() => f.views.get("background").handleCancelEdit());
    assert.equal(f.views.get("background").editTargetId, null);
    assert.equal(allowAppRestart(), false);
    await act(async () => {
      gate.resolve();
      await saving;
    });
    assert.equal(allowAppRestart(), true);
  } finally {
    gate.resolve();
    await f.close();
  }
});

for (const during of ["download", "install"]) {
  test(`real late main edit during ${during} blocks the next restart checkpoint`, async () => {
    const f = await fixture();
    const gate = deferred();
    const entered = deferred();
    const calls = [];
    const controller = explicitUpdate(
      {
        version: "0.5.28-ideaflow.10",
        download: async () => {
          calls.push("download");
          if (during === "download") {
            entered.resolve();
            await gate.promise;
          }
        },
        install: async () => {
          calls.push("install");
          if (during === "install") {
            entered.resolve();
            await gate.promise;
          }
        },
        close: async () => {},
      },
      allowAppRestart,
      async () => calls.push("restart"),
      () => {},
    );
    try {
      const started = controller.start();
      await entered.promise;
      await act(() =>
        f.views.get("background").handleEdit({ id: "late-main-edit" }),
      );
      gate.resolve();
      await started;
      assert.equal(calls.includes("restart"), false);
      assert.equal(calls.includes("install"), during === "install");
      assert.equal(f.views.get("background").editTargetId, "late-main-edit");
      await act(() => f.views.get("background").handleCancelEdit());
      assert.equal(
        calls.includes("restart"),
        false,
        "cancel does not auto-restart",
      );
      await controller.start();
      assert.equal(calls.filter((v) => v === "restart").length, 1);
    } finally {
      gate.resolve();
      await controller.dispose();
      await f.close();
    }
  });
}

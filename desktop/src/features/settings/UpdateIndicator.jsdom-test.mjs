import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
registerHooks({
  resolve(s, c, n) {
    return s === "./hooks/UpdaterProvider"
      ? { shortCircuit: true, url: "update-announcement:context" }
      : n(s, c);
  },
  load(u, c, n) {
    return u === "update-announcement:context"
      ? {
          shortCircuit: true,
          format: "module",
          source:
            "export const useUpdaterContext=()=>({status:globalThis.__announcementStatus,installAndRelaunch:()=>globalThis.__restartClick()});",
        }
      : n(u, c);
  },
});
test("one persistent polite update owner announces transitions without version age ticks", async () => {
  const { UpdateStatusAnnouncement } = await import("./UpdateIndicator.tsx");
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    let owner;
    for (const [state, text] of [
      ["idle", ""],
      ["manual-required", "Update available"],
      ["downloading", "Downloading update…"],
      ["ready", "Restart to update"],
      ["error", "Update check failed"],
    ]) {
      globalThis.__announcementStatus = { state, message: "offline" };
      await act(() =>
        root.render(React.createElement(UpdateStatusAnnouncement)),
      );
      assert.equal(node.querySelectorAll('[role="status"]').length, 1);
      const current = node.querySelector('[role="status"]');
      assert.equal(current.getAttribute("aria-live"), "polite");
      assert.ok(current.textContent.startsWith(text));
      if (owner) assert.equal(current, owner);
      owner = current;
    }
  } finally {
    await act(() => root.unmount());
    node.remove();
    delete globalThis.__announcementStatus;
  }
});

test("available update exposes a real single-click Restart to update button", async () => {
  const { UpdateIndicator } = await import("./UpdateIndicator.tsx");
  const { TooltipProvider } = await import("@/shared/ui/tooltip");
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  let clicks = 0;
  globalThis.__announcementStatus = {
    state: "available",
    version: "0.5.28-ideaflow.10",
  };
  globalThis.__restartClick = () => {
    clicks++;
  };
  try {
    await act(() =>
      root.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(UpdateIndicator, { showLabel: true }),
        ),
      ),
    );
    const button = node.querySelector('button[aria-label="Restart to update"]');
    assert.ok(button);
    assert.equal(button.disabled, false);
    assert.equal(clicks, 0);
    await act(() => button.click());
    assert.equal(clicks, 1);
  } finally {
    await act(() => root.unmount());
    node.remove();
    delete globalThis.__restartClick;
    delete globalThis.__announcementStatus;
  }
});

import { PaseoHostContext as HostContext } from "@/shared/context/PaseoHostContext";
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { relayClient } from "@/shared/api/relayClient";
import { presenceQueryKey } from "../hooks.ts";
import { PaseoHostProvider, PaseoHostBanner } from "./PaseoHostProvider.tsx";
import { PASEO_HOST_PUBKEY as PK } from "../lib/paseoHostHealth.ts";
import { MessageReactions } from "@/features/messages/ui/MessageReactions.tsx";
import { EmojiBurstProvider } from "@/shared/ui/EmojiBurstProvider.tsx";
import { TooltipProvider } from "@/shared/ui/tooltip.tsx";

afterEach(() => {
  cleanup();
  mock.restoreAll();
  mock.timers.reset();
  localStorage.clear();
  delete window.__TAURI_INTERNALS__;
});
for (const [permission, failure, restartHealthy] of [
  ["granted", false],
  ["denied", false],
  ["default", false],
  ["denied", true],
  ["granted", false, "old-cache"],
  ["granted", false, "recorded-outage"],
]) {
  test(`local expiry, deduplicated toast/native permission ${permission} fetch failure ${failure}, healthy restart ${restartHealthy ?? false}, scoped marks and recovery`, async () => {
    localStorage.setItem(
      "buzz-paseo-host-watch.v1:viewer:wss://jprojects.communities.buzz.xyz",
      JSON.stringify({
        startedAt: Date.now() - 190000,
        lastSeenAt: Date.now() - 190000,
        offlineSince:
          restartHealthy === "recorded-outage" ? Date.now() - 190000 : null,
      }),
    );
    globalThis.isTauri = true;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { platform: "MacIntel", userAgent: "" },
    });
    window.Notification = class {
      constructor() {
        throw Error("Use native adapter");
      }
      static permission = permission;
      static requestPermission() {
        throw Error("Must not prompt");
      }
    };
    window.matchMedia = () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    });
    mock.method(window.HTMLCanvasElement.prototype, "getContext", () => null);
    mock.method(relayClient, "getConnectionState", () => "connected");
    mock.method(relayClient, "subscribeToConnectionState", () => () => {});
    let available = Boolean(restartHealthy);
    const native = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args) => {
        if (cmd === "get_presence") {
          if (failure && !available) throw Error("presence unavailable");
          return available ? { [PK]: "online" } : {};
        }
        if (cmd === "notification_permission_state") return permission;
        if (cmd === "show_native_notification") {
          native.push(args);
          return;
        }
        throw Error(`Unexpected command ${cmd}`);
      },
    };
    const warnings = [],
      recoveries = [];
    mock.method(toast, "warning", (body) => warnings.push(body));
    mock.method(toast, "success", (body) => recoveries.push(body));
    mock.method(toast, "dismiss", () => {});
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const tree = () =>
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          PaseoHostProvider,
          {
            pubkey: "viewer",
            relayUrl: "wss://jprojects.communities.buzz.xyz",
          },
          React.createElement(PaseoHostBanner),
        ),
      );
    const view = render(React.createElement(React.StrictMode, null, tree()));
    const flush = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      for (let i = 0; i < 10; i++) await new Promise(setImmediate);
    };
    await act(flush);
    if (restartHealthy) {
      assert.equal(Boolean(view.queryByTestId("paseo-host-offline")), false);
      assert.equal(
        warnings.length,
        0,
        "no false offline alert while first read hydrates",
      );
      assert.equal(native.length, 0);
      assert.equal(
        recoveries.length,
        restartHealthy === "recorded-outage" ? 1 : 0,
      );
      view.unmount();
      client.clear();
      return;
    }
    assert.ok(
      view
        .getByTestId("paseo-host-offline")
        .textContent.includes("⏳ statuses may be stale"),
    );
    assert.equal(warnings.length, 1);
    assert.equal(native.length, permission === "granted" ? 1 : 0);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await flush();
    });
    assert.equal(warnings.length, 1);
    available = true;
    await act(async () => {
      client.setQueryData(presenceQueryKey([PK]), { [PK]: "away" });
      await flush();
    });
    assert.equal(Boolean(view.queryByTestId("paseo-host-offline")), false);
    assert.equal(recoveries.length, 1);
    assert.match(recoveries[0], /^Paseo back \(offline .*–.*\)$/);
    view.unmount();
    client.clear();
  });
}

test("Paseo-only hourglass dims and recovers without affecting another author", () => {
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  mock.method(window.HTMLCanvasElement.prototype, "getContext", () => null);
  const reactions = [
    {
      emoji: "⏳",
      count: 1,
      users: [{ pubkey: PK, displayName: "Paseo", avatarUrl: null }],
    },
    {
      emoji: "✅",
      count: 1,
      users: [{ pubkey: PK, displayName: "Paseo", avatarUrl: null }],
    },
  ];
  const tree = (offlineSince) =>
    React.createElement(
      HostContext.Provider,
      { value: { offlineSince } },
      React.createElement(
        EmojiBurstProvider,
        null,
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(MessageReactions, {
            messageId: "one",
            reactions,
            canToggle: false,
            pending: false,
            onSelect() {},
          }),
        ),
      ),
    );
  const view = render(tree(1));
  assert.ok(
    view
      .getByRole("button", { name: "Toggle ⏳ reaction" })
      .className.includes("opacity-50"),
  );
  assert.ok(
    !view
      .getByRole("button", { name: "Toggle ✅ reaction" })
      .className.includes("opacity-50"),
  );
  view.rerender(tree(null));
  assert.ok(
    !view
      .getByRole("button", { name: "Toggle ⏳ reaction" })
      .className.includes("opacity-50"),
  );
});

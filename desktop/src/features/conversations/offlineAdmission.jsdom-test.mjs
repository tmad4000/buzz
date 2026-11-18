import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OfflineConversation } from "./OfflineConversation.tsx";
import {
  ConversationViewContext,
  useConversationReadAdmission,
} from "./ConversationViewContext.tsx";
import { relayClient } from "@/shared/api/relayClient";
import { offlineConnectionEpoch } from "@/shared/api/offlineConnection";

test("cached heads and a reconnect generation never admit cached reading, including queued callbacks", async () => {
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  window.localStorage.setItem("buzz-offline-cache-v1", "on");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  relayClient.connectionStateEmitter.set("connected");
  let canRead;
  let admitted;
  function Body() {
    ({ canRead, admitted } = useConversationReadAdmission());
    return null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  client.setQueryData(["offline-snapshot", "general"], {
    source: "cache",
    savedAt: 1000,
  });
  try {
    await act(() =>
      root.render(
        React.createElement(
          QueryClientProvider,
          { client },
          React.createElement(
            ConversationViewContext.Provider,
            { value: { focused: true, visible: true, viewInstanceId: "main" } },
            React.createElement(
              OfflineConversation,
              { channelId: "general" },
              React.createElement(Body),
            ),
          ),
        ),
      ),
    );
    assert.equal(admitted, false);
    assert.equal(canRead(), false);
    await act(async () => {
      client.setQueryData(["offline-snapshot", "general"], null);
      client.setQueryData(
        ["offline-live", "general"],
        offlineConnectionEpoch(),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(canRead(), true);
    const queuedCallback = canRead;
    // Before React can render the disconnected state, callback-time admission fails.
    relayClient.connectionStateEmitter.set("disconnected");
    assert.equal(queuedCallback(), false);
    relayClient.connectionGeneration++;
    relayClient.connectionStateEmitter.set("connected");
    assert.equal(
      queuedCallback(),
      false,
      "reconnected transport is not an authoritative page fetch",
    );
    await act(async () => {
      client.setQueryData(
        ["offline-live", "general"],
        offlineConnectionEpoch(),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    assert.equal(canRead(), true);
  } finally {
    await act(() => root.unmount());
    client.clear();
    window.localStorage.removeItem("buzz-offline-cache-v1");
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
  useQuery,
} from "@tanstack/react-query";
import { OfflineConversation } from "./OfflineConversation.tsx";
import {
  ConversationViewContext,
  useConversationReadAdmission,
} from "./ConversationViewContext.tsx";
import { relayClient } from "@/shared/api/relayClient";
import { offlineConnectionEpoch } from "@/shared/api/offlineConnection";
import { loadThreadReplies } from "@/features/messages/useThreadReplies";
const row = (id) => ({
  id,
  content: id,
  kind: 9,
  created_at: 1,
  pubkey: "alice",
  sig: "",
  tags: [["e", "root", "", "reply"]],
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 15));
function foreground() {
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
  relayClient.connectionStateEmitter.set("connected");
}
async function pane(client, threadKey) {
  let canRead;
  function Body() {
    ({ canRead } = useConversationReadAdmission());
    const observed = useQuery({
      queryKey: threadKey ?? ["no-thread"],
      queryFn: async () => [],
      enabled: false,
    });
    return React.createElement(
      "span",
      null,
      observed.data?.map((event) => event.id).join(",") ?? "body",
    );
  }
  const node = document.createElement("div");
  const root = createRoot(node);
  await act(() =>
    root.render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(
          ConversationViewContext.Provider,
          { value: { focused: true, visible: true, viewInstanceId: "review" } },
          React.createElement(
            OfflineConversation,
            { channelId: "general" },
            React.createElement(Body),
          ),
        ),
      ),
    ),
  );
  return {
    node,
    read: () => canRead(),
    close: () => act(() => root.unmount()),
  };
}
test("R2 observed old thread stays denied through head refresh, pending/failed refetch, and admits only committed current-thread success", async () => {
  foreground();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const key = ["thread-replies", "general", "root"];
  const observer = new QueryObserver(client, { queryKey: key, enabled: false });
  const stop = observer.subscribe(() => {});
  client.setQueryData(key, [row("old")]);
  client.setQueryData(["offline-live", "general"], offlineConnectionEpoch());
  const view = await pane(client, key);
  const fetch = (fetcher, signal) =>
    loadThreadReplies(
      client,
      "general",
      "root",
      null,
      undefined,
      fetcher,
      signal,
    );
  try {
    assert.equal(
      view.read(),
      false,
      "absence of disk marker is not thread authority",
    );
    await act(async () => {
      await client.fetchQuery({
        queryKey: key,
        queryFn: () =>
          fetch(async () => ({ events: [row("old")], nextCursor: null })),
      });
      await tick();
    });
    assert.equal(view.read(), true);
    await act(() => {
      relayClient.connectionStateEmitter.set("disconnected");
    });
    assert.equal(view.read(), false);
    await act(async () => {
      relayClient.connectionGeneration++;
      relayClient.connectionStateEmitter.set("connected");
      client.setQueryData(
        ["offline-live", "general"],
        offlineConnectionEpoch(),
      );
      await tick();
    });
    assert.equal(
      view.read(),
      false,
      "fresh head and DOM commit cannot grant old thread",
    );
    let rejectRead;
    let pending;
    await act(async () => {
      pending = client
        .fetchQuery({
          queryKey: key,
          queryFn: () =>
            fetch(
              () =>
                new Promise((_, reject) => {
                  rejectRead = reject;
                }),
            ),
        })
        .catch((error) => error);
      await tick();
    });
    assert.equal(view.read(), false, "pending thread is not refreshed");
    await act(async () => {
      rejectRead(new Error("relay failed"));
      await pending;
      await tick();
    });
    assert.equal(view.read(), false, "failed thread stays inadmissible");
    let finish;
    client.setQueryData(["offline-source", ...key], {
      source: "cache",
      savedAt: 1,
    });
    const returned = await fetch(async () => ({
      events: [row("fresh")],
      nextCursor: null,
    }));
    assert.equal(client.getQueryData(key)[0].id, "old");
    assert.match(view.node.textContent, /old/);
    assert.equal(
      client.getQueryData(["offline-source", ...key]).source,
      "cache",
      "successful return cannot clear provenance before data commit",
    );
    assert.equal(
      view.read(),
      false,
      "returned body not yet committed cannot grant",
    );
    await act(async () => {
      await client.fetchQuery({
        queryKey: key,
        queryFn: () =>
          fetch(async () => ({ events: [row("fresh")], nextCursor: null })),
      });
      await tick();
    });
    assert.equal(view.read(), true);
    assert.match(view.node.textContent, /fresh/);
    assert.equal(client.getQueryData(["offline-source", ...key]), undefined);
    // An obsolete completion must reject rather than publish proof for the new socket.
    const controller = new AbortController();
    const obsolete = fetch(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      controller.signal,
    );
    await tick();
    relayClient.connectionGeneration++;
    finish({ events: [row("obsolete")], nextCursor: null });
    await assert.rejects(obsolete, /superseded/);
    assert.equal(view.read(), false);
    const cancelled = new AbortController();
    let complete;
    const work = fetch(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
      cancelled.signal,
    );
    await tick();
    cancelled.abort();
    complete({ events: [row("canceled")], nextCursor: null });
    await assert.rejects(work, /superseded/);
  } finally {
    await view.close();
    stop();
    client.clear();
    window.localStorage.removeItem("buzz-offline-cache-v1");
  }
});
test("R6 cached as-of survives prolonged connecting and reconnecting, then waits for authoritative refresh", async () => {
  foreground();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["offline-snapshot", "general"], {
    source: "cache",
    savedAt: 1000,
  });
  const view = await pane(client);
  try {
    for (const state of ["connecting", "reconnecting"]) {
      await act(async () => {
        relayClient.connectionStateEmitter.set(state);
        await new Promise((resolve) => setTimeout(resolve, 2100));
      });
      assert.match(view.node.textContent, /Offline · showing cached as of/);
      assert.equal(view.read(), false);
    }
    await act(async () => {
      relayClient.connectionStateEmitter.set("connected");
      await tick();
    });
    assert.match(view.node.textContent, /Back online · refreshing/);
    assert.equal(view.read(), false);
    await act(async () => {
      client.setQueryData(["offline-snapshot", "general"], null);
      client.setQueryData(
        ["offline-live", "general"],
        offlineConnectionEpoch(),
      );
      await tick();
    });
    assert.doesNotMatch(view.node.textContent, /showing cached|refreshing/);
    assert.equal(view.read(), true);
  } finally {
    await view.close();
    client.clear();
    window.localStorage.removeItem("buzz-offline-cache-v1");
  }
});

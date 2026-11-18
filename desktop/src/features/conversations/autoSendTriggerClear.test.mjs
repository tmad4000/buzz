import assert from "node:assert/strict";
import test from "node:test";
import { ConversationProjectionEchoes } from "./projectionEchoes.ts";
import { clearCapturedAutoSendTrigger } from "./autoSendTriggerClear.ts";

function fixture() {
  let location = {
    href: "/channels/chat?thread=root&autoSend=thread%3Aroot&other=keep#anchor",
    hash: "anchor",
    search: { thread: "root", autoSend: "thread:root", other: "keep" },
    state: {
      __TSR_key: "captured",
      unrelated: 42,
      searchHighlight: { activationId: "keep" },
    },
  };
  const original = structuredClone(location);
  const listeners = new Set();
  const echoes = new ConversationProjectionEchoes();
  let active = true,
    navigations = 0;
  const options = {
    entryKey: JSON.stringify([location.state.__TSR_key, location.href]),
    target: {
      scopeKey: "scope",
      viewId: "a",
      channelId: "chat",
      visit: 1,
      draftKey: "thread:root",
      ownerId: "owner",
    },
    view: { id: "a", channelId: "chat", panelState: { thread: "root" } },
    admitted: () => active,
    readLocation: () => location,
    readHistory: () => location,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    navigate: async (projection) => {
      navigations++;
      const state = projection.state(location.state);
      location = {
        href: "/channels/chat?thread=root&other=keep#anchor",
        hash: projection.hash,
        search: projection.search,
        state: { ...state, __TSR_key: "replaced" },
      };
      for (const listener of listeners) listener(location, "REPLACE");
    },
    echoes,
    echoOwner: {},
    projectionId: "unique-clear",
  };
  return {
    options,
    original,
    echoes,
    listeners,
    read: () => location,
    set: (next) => {
      location = next;
    },
    active: (value) => {
      active = value;
    },
    navigations: () => navigations,
  };
}

test("captured clear preserves thread/search/hash/highlight and leaves a bound one-use projection echo", async () => {
  const h = fixture();
  assert.equal(await clearCapturedAutoSendTrigger(h.options), true);
  assert.equal(h.navigations(), 1);
  assert.deepEqual(h.read().search, { thread: "root", other: "keep" });
  assert.equal(h.read().hash, "anchor");
  assert.equal(h.read().state.unrelated, 42);
  assert.deepEqual(
    h.read().state.searchHighlight,
    h.original.state.searchHighlight,
  );
  assert.equal(h.read().state.buzzConversationAutoSend, null);
  assert.equal(
    h.echoes.consume("unique-clear", "replaced", {
      scopeKey: "scope",
      viewId: "a",
      channelId: "chat",
      panelState: h.read().search,
    }),
    true,
  );
  assert.equal(h.listeners.size, 0);
  assert.equal(await clearCapturedAutoSendTrigger(h.options), false);
  assert.equal(h.navigations(), 1);
});

test("foreign draft/view/current-entry and lost admission never mutate navigation", async () => {
  for (const change of [
    (h) => h.active(false),
    (h) => {
      h.options.target = { ...h.options.target, draftKey: "other" };
    },
    (h) => {
      h.options.view = { ...h.options.view, id: "b" };
    },
    (h) => h.set({ ...h.read(), state: { __TSR_key: "newer" } }),
  ]) {
    const h = fixture();
    change(h);
    assert.equal(await clearCapturedAutoSendTrigger(h.options), false);
    assert.equal(h.navigations(), 0);
  }
});

test("changed entry during subscription cannot be overwritten by a stale clear", async () => {
  const h = fixture();
  const subscribe = h.options.subscribe;
  h.options.subscribe = (listener) => {
    const stop = subscribe(listener);
    h.set({ ...h.read(), state: { __TSR_key: "newer" } });
    return stop;
  };
  assert.equal(await clearCapturedAutoSendTrigger(h.options), false);
  assert.equal(h.navigations(), 0);
  assert.equal(h.listeners.size, 0);
});

test("navigation failure or unconfirmed/foreign settlement denies submission and clears listeners/echo", async () => {
  for (const mode of ["throw", "no-event", "foreign", "lost-admission"]) {
    const h = fixture();
    const navigate = h.options.navigate;
    h.options.navigate = async (projection) => {
      if (mode === "throw") throw new Error("router failed");
      if (mode === "no-event") return;
      await navigate(projection);
      if (mode === "foreign")
        h.set({ ...h.read(), search: { ...h.read().search, thread: "other" } });
      if (mode === "lost-admission") h.active(false);
    };
    assert.equal(await clearCapturedAutoSendTrigger(h.options), false);
    assert.equal(h.listeners.size, 0);
    assert.equal(
      h.echoes.consume("unique-clear", "replaced", {
        scopeKey: "scope",
        viewId: "a",
        channelId: "chat",
        panelState: { thread: "root" },
      }),
      false,
    );
  }
});

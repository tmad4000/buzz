import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as model from "./model.ts";
import { snapshot, clock } from "./fixtures.mjs";
const require = createRequire(import.meta.url);
function load(url, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(url, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) => (s in mocks ? mocks[s] : require(s)),
    Date,
    setInterval,
    clearInterval,
  });
  return module.exports;
}
test("production hook never subscribes for disabled, foreign relay/identity/profile or lost/locked keys", () => {
  for (const enabled of [false, true])
    for (const relay of [model.QUEUE_RELAY, "https://other.test"])
      for (const pubkey of [model.QUEUE_BRIDGE, "other"])
        for (const recipient of [model.QUEUE_RECIPIENT, "other"])
          for (const lost of [false, true])
            for (const locked of [false, true]) {
              let subscriptions = 0,
                reads = 0;
              const reader = {
                subscribe: () => {
                  subscriptions++;
                  return () => {};
                },
                getSnapshot: () => {
                  reads++;
                  return { status: "ready", snapshot: snapshot() };
                },
              };
              const mod = load(new URL("./useAgentQueue.ts", import.meta.url), {
                react: {
                  useSyncExternalStore: (subscribe, get) => {
                    subscribe(() => {});
                    return get();
                  },
                },
                "@/shared/api/hooks": {
                  useIdentityQuery: () => ({
                    data: { pubkey: recipient, lost, locked },
                  }),
                },
                "@/shared/api/relayClient": { relayClient: {} },
                "@/shared/api/tauri": { invokeTauri: assert.fail },
                "@/shared/lib/useRelayOrigin": { useRelayOrigin: () => relay },
                "./model": model,
                "./reader": { createQueueReader: () => reader },
                "./preference": { useQueueEnabled: () => enabled },
              });
              const got = mod.useAgentQueue(pubkey);
              const allowed =
                relay === model.QUEUE_RELAY &&
                pubkey === model.QUEUE_BRIDGE &&
                recipient === model.QUEUE_RECIPIENT &&
                !lost &&
                !locked;
              assert.equal(got.allowed, allowed);
              assert.equal(subscriptions, enabled && allowed ? 1 : 0);
              assert.equal(reads, enabled && allowed ? 1 : 0);
            }
});
test("real rendered private row/profile use success clock, hide stale/error counts, and have only opt-in control", async (t) => {
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: clock * 1000 });
  const dom = new JSDOM('<div id="root"></div>');
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { useNow } = load(
    new URL("../../shared/lib/useNow.ts", import.meta.url),
    { "@/shared/lib/useDocumentVisible": { useDocumentVisible: () => true } },
  );
  let state = {
    allowed: true,
    enabled: false,
    view: { status: "ready", snapshot: snapshot() },
  };
  const savedPreference = [];
  const mod = load(new URL("./AgentQueueView.tsx", import.meta.url), {
    "@/shared/lib/useNow": { useNow },
    "./useAgentQueue": { useAgentQueue: () => state },
    "./preference": { setQueueEnabled: (v) => savedPreference.push(v) },
    "./model": model,
    sonner: { toast: { error: assert.fail } },
  });
  const root = createRoot(document.getElementById("root"));
  const render = async () =>
    act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(mod.AgentQueueRow, {
            pubkey: model.QUEUE_BRIDGE,
          }),
          React.createElement(mod.AgentQueuePanel, {
            pubkey: model.QUEUE_BRIDGE,
          }),
        ),
      ),
    );
  try {
    await render();
    assert.doesNotMatch(document.body.textContent, /1 queued/);
    assert.equal(document.querySelector("input").checked, false);
    state = { ...state, enabled: true };
    await render();
    assert.match(document.body.textContent, /Running · 1 queued/);
    assert.match(document.body.textContent, /Jacob DM request/);
    assert.match(document.body.textContent, /Last verified queue: 2026-/);
    assert.equal(document.querySelectorAll("button").length, 0);
    await act(async () => t.mock.timers.tick(120000));
    assert.match(document.body.textContent, /1 queued/);
    await act(async () => t.mock.timers.tick(1000));
    assert.match(document.body.textContent, /STALE/);
    assert.doesNotMatch(document.body.textContent, /1 queued|Jacob DM request/);
    const q = {
      ...snapshot(),
      availability: "unavailable",
      rootState: "unknown",
      observedAt: clock + 121,
      verifiedAt: clock,
      depth: null,
      oldestCreatedAt: null,
      items: [],
      recent: [],
      omitted: 0,
      complete: false,
    };
    state = { ...state, view: { status: "ready", snapshot: q } };
    await render();
    assert.match(document.body.textContent, /Queue unavailable/);
    assert.match(document.body.textContent, /last verified 2m ago/);
    assert.doesNotMatch(document.body.textContent, /Idle|0 queued/);
    state = { ...state, view: { status: "error" } };
    await render();
    assert.match(document.body.textContent, /Previous projection hidden/);
    assert.doesNotMatch(
      document.body.textContent,
      /Last verified queue|1 queued/,
    );
    state = { ...state, allowed: false };
    await render();
    assert.equal(document.body.textContent, "");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, saved);
    t.mock.timers.reset();
  }
});

test("actual device preference defaults off, persists only boolean, and shares cross-tab listener until last subscriber", () => {
  const saved = {
    localStorage: globalThis.localStorage,
    window: globalThis.window,
  };
  const map = new Map();
  const subscriptions = [];
  let storageListener,
    adds = 0,
    removes = 0,
    notices = 0;
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key) => map.get(key),
      setItem: (key, value) => map.set(key, value),
    },
    window: {
      addEventListener: (_name, fn) => {
        storageListener = fn;
        adds++;
      },
      removeEventListener: () => {
        storageListener = undefined;
        removes++;
      },
    },
  });
  try {
    // Preference module needs the host globals; expose only those objects to its isolated loader.
    const url = new URL("./preference.ts", import.meta.url);
    const module = { exports: {} };
    const js = ts.transpileModule(fs.readFileSync(url, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(js, {
      module,
      exports: module.exports,
      localStorage: globalThis.localStorage,
      window: globalThis.window,
      require: (s) =>
        s === "react"
          ? {
              useSyncExternalStore: (subscribe, get) => {
                subscriptions.push(subscribe(() => notices++));
                return get();
              },
            }
          : require(s),
    });
    const mod = module.exports;
    assert.equal(mod.useQueueEnabled(), false);
    assert.equal(mod.useQueueEnabled(), false);
    assert.equal(adds, 1);
    mod.setQueueEnabled(true);
    assert.deepEqual([...map.values()], ["true"]);
    assert.equal(notices, 2);
    subscriptions.shift()();
    assert.equal(removes, 0);
    storageListener();
    assert.equal(notices, 3);
    subscriptions.shift()();
    assert.equal(removes, 1);
    map.clear();
    mod.setQueueEnabled(false);
    assert.deepEqual([...map.values()], ["false"]);
  } finally {
    Object.assign(globalThis, saved);
  }
});

test("authentication work is bounded before crypto, and candidate signature checks precede replacement shape checks", () => {
  let calls = 0;
  const mod = load(new URL("./model.ts", import.meta.url), {
    "nostr-tools/pure": {
      verifyEvent: () => {
        calls++;
        return true;
      },
    },
  });
  const base = {
    id: "1".repeat(64),
    pubkey: model.QUEUE_BRIDGE,
    kind: 30078,
    created_at: clock,
    tags: [
      ["d", model.QUEUE_D],
      ["p", model.QUEUE_RECIPIENT],
    ],
    content: "Ag==",
    sig: "0".repeat(128),
  };
  assert.equal(mod.authenticatedSibling(base, clock), true);
  assert.equal(calls, 1);
  for (const patch of [
    { content: "a".repeat(32769) },
    { sig: "0".repeat(100000) },
    { id: "1".repeat(100000) },
    { tags: Array.from({ length: 17 }, () => ["d", model.QUEUE_D]) },
    {
      tags: [
        ["d", model.QUEUE_D],
        ["x", "x".repeat(257)],
      ],
    },
  ]) {
    assert.equal(mod.authenticatedSibling({ ...base, ...patch }, clock), false);
    assert.equal(calls, 1);
  }
  const badshape = { ...base, tags: [...base.tags, ["h", "bad"]] };
  assert.equal(mod.authenticatedSibling(badshape, clock), true);
  assert.equal(calls, 2);
});

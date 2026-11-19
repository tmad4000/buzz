import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as model from "./model.ts";
import { vectors } from "./test-fixtures.mjs";
import { fleetPresentation } from "./presentation.ts";
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
  });
  return module.exports;
}
test("global hook default-off/foreign/recovery scopes cannot subscribe or expose decrypted fleet data", () => {
  for (const enabled of [false, true])
    for (const origin of [model.FLEET_RELAY, "https://elsewhere.test"])
      for (const key of [model.FLEET_RECIPIENT, "other"])
        for (const recovery of ["none", "lost", "locked", "resetFailed"]) {
          let calls = 0,
            reads = 0,
            captured;
          const io = {
            subscribe: () => {
              calls++;
              return () => {};
            },
            getSnapshot: () => {
              reads++;
              return {
                status: "ready",
                snapshot: vectors.validPayloads[0].payload,
              };
            },
          };
          const mod = load(new URL("./useFleetStatus.ts", import.meta.url), {
            react: {
              useSyncExternalStore: (subscribe, get) => {
                subscribe(() => {});
                return get();
              },
            },
            "@/shared/api/hooks": {
              useIdentityQuery: () => ({
                data: {
                  pubkey: key,
                  lost: recovery === "lost",
                  locked: recovery === "locked",
                  resetFailed: recovery === "resetFailed",
                },
              }),
            },
            "@/shared/api/relayClient": { relayClient: {} },
            "@/shared/api/tauri": { invokeTauri: assert.fail },
            "@/shared/lib/useRelayOrigin": { useRelayOrigin: () => origin },
            "./model": model,
            "./reader": {
              createFleetReader: (options) => {
                captured = options;
                return io;
              },
            },
            "./preference": { useFleetEnabled: () => enabled },
          });
          const got = mod.useFleetStatus();
          const allowed =
            origin === model.FLEET_RELAY &&
            key === model.FLEET_RECIPIENT &&
            recovery === "none";
          assert.equal(got.allowed, allowed);
          assert.equal(calls, allowed && enabled ? 1 : 0);
          assert.equal(reads, allowed && enabled ? 1 : 0);
          assert.equal(typeof captured.decrypt, "function");
        }
});
test("hook IO is one exact fleet subscription and narrow fixed recipient command, never hidden queue read", async () => {
  let options;
  const native = [],
    subscriptions = [];
  load(new URL("./useFleetStatus.ts", import.meta.url), {
    react: { useSyncExternalStore: assert.fail },
    "@/shared/api/hooks": {},
    "@/shared/api/relayClient": {
      relayClient: { subscribeLive: (...args) => subscriptions.push(args) },
    },
    "@/shared/api/tauri": { invokeTauri: (...args) => native.push(args) },
    "@/shared/lib/useRelayOrigin": {},
    "./model": model,
    "./reader": {
      createFleetReader: (io) => {
        options = io;
        return {};
      },
    },
    "./preference": {},
  });
  const signal = new AbortController().signal;
  const cb = () => {},
    ready = () => {};
  options.subscribe(cb, ready, signal);
  await options.decrypt({ id: "opaque" });
  assert.equal(subscriptions.length, 1);
  assert.equal(
    JSON.stringify(subscriptions[0][0]),
    JSON.stringify(model.fleetFilter()),
  );
  assert.equal(subscriptions[0][4], signal);
  assert.equal(native[0][0], "decrypt_agent_fleet_event");
  assert.equal(native[0][1].expectedRelayOrigin, model.FLEET_RELAY);
  assert.equal(native[0][1].expectedRecipient, model.FLEET_RECIPIENT);
});
test("global action opens existing Root queue/profile or existing Agents fallback; no inert Open control", () => {
  let state = {
    allowed: true,
    enabled: true,
    view: { status: "ready", snapshot: vectors.validPayloads[0].payload },
  };
  let open = true;
  const profiles = [],
    agents = [];
  const mod = load(new URL("./FleetStatusButton.tsx", import.meta.url), {
    "@/shared/context/ProfilePanelContext": {
      useProfilePanel: () => ({
        openProfilePanel: open ? (key) => profiles.push(key) : null,
      }),
    },
    sonner: { toast: { error: assert.fail } },
    "./model": model,
    "./GlobalFleetIndicator": { GlobalFleetIndicator: () => null },
    "./preference": { setFleetEnabled: assert.fail },
    "./useFleetStatus": { useFleetStatus: () => state },
  });
  const button = mod.FleetStatusButton({
    onOpenAgents: () => agents.push(true),
  });
  button.props.onOpenQueue();
  assert.deepEqual(profiles, [model.FLEET_BRIDGE]);
  open = false;
  mod
    .FleetStatusButton({ onOpenAgents: () => agents.push(true) })
    .props.onOpenQueue();
  assert.equal(agents.length, 1);
  assert.equal(mod.FleetIndicatorPreference({ pubkey: "other" }), null);
  for (const change of [{ allowed: false }, { enabled: false }]) {
    state = { ...state, ...change };
    assert.equal(mod.FleetStatusButton({ onOpenAgents: assert.fail }), null);
  }
});
test("frozen valid vectors project partial lower bounds and expire only queue at receive time", () => {
  const mod = load(new URL("./FleetStatusButton.tsx", import.meta.url), {
    "@/shared/context/ProfilePanelContext": {},
    sonner: {},
    "./model": model,
    "./GlobalFleetIndicator": {},
    "./preference": {},
    "./useFleetStatus": {},
  });
  const partial = vectors.validPayloads[1].payload;
  const view = fleetPresentation(
    mod.fleetObservation(partial),
    partial.observedAt,
  );
  assert.match(view.label, /at least 0 observed working · partial/);
  assert.match(view.label, /root busy/);
  assert.equal(view.pulse, true);
  assert.equal(view.tone, "working");
  const q = vectors.validPayloads[3].payload;
  const before = fleetPresentation(mod.fleetObservation(q), q.observedAt),
    after = fleetPresentation(mod.fleetObservation(q), q.observedAt + 1);
  assert.match(before.label, /3 queued/);
  assert.match(after.label, /queue unknown/);
  assert.match(after.label, /agents working/);
  assert.equal(after.tone, "working");
  const failed = vectors.validPayloads[2].payload;
  const unavailable = fleetPresentation(
    mod.fleetObservation(failed),
    failed.observedAt,
  );
  assert.match(unavailable.label, /unavailable/);
  assert.doesNotMatch(unavailable.label, /agents working|queued|root idle/);
});
test("header mounts the global indicator alongside search and forwards existing Agents navigation", () => {
  function FleetStatusButton() {}
  function TopbarSearch() {}
  const target = () => {};
  const mod = load(
    new URL("../sidebar/ui/AppSidebarPinnedHeader.tsx", import.meta.url),
    {
      "@/features/agent-fleet/FleetStatusButton": { FleetStatusButton },
      "lucide-react": {},
      "@/features/search/ui/TopbarSearch": { TopbarSearch },
      "@/features/sidebar/ui/SidebarProjectsSection": {},
      "@/shared/features": {},
      "@/shared/ui/sidebar": {},
      "@/shared/ui/sidebar-menu-label": {},
      "@protected-feature-components": {},
    },
  );
  const tree = mod.AppSidebarPinnedHeader({ onOpenAgents: target });
  assert.equal(tree.props.children[0].type, TopbarSearch);
  assert.equal(tree.props.children[1].type, FleetStatusButton);
  assert.equal(tree.props.children[1].props.onOpenAgents, target);
});

test("actual fleet flag is off independently of an enabled queue flag and keeps one cross-tab listener", () => {
  const map = new Map([["buzz.private-agent-queue.v1", "true"]]);
  let adds = 0,
    removes = 0;
  const disposals = [];
  const module = { exports: {} };
  const source = fs.readFileSync(
    new URL("./preference.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    localStorage: {
      getItem: (k) => map.get(k),
      setItem: (k, v) => map.set(k, v),
    },
    window: {
      addEventListener: () => adds++,
      removeEventListener: () => removes++,
    },
    require: (s) =>
      s === "react"
        ? {
            useSyncExternalStore: (subscribe, get) => {
              disposals.push(subscribe(() => {}));
              return get();
            },
          }
        : require(s),
  });
  const mod = module.exports;
  assert.equal(mod.useFleetEnabled(), false);
  assert.equal(mod.useFleetEnabled(), false);
  assert.equal(adds, 1);
  mod.setFleetEnabled(true);
  assert.equal(map.get("buzz.private-agent-fleet.v1"), "true");
  assert.equal(map.get("buzz.private-agent-queue.v1"), "true");
  disposals.shift()();
  assert.equal(removes, 0);
  disposals.shift()();
  assert.equal(removes, 1);
  mod.setFleetEnabled(false);
  assert.equal(map.get("buzz.private-agent-fleet.v1"), "false");
  assert.equal(map.get("buzz.private-agent-queue.v1"), "true");
});

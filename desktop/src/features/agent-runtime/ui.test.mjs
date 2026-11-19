import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { runtimeSessionLink } from "./model.ts";
const require = createRequire(import.meta.url);
function load(name, mocks) {
  const path = new URL(name, import.meta.url);
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) =>
      s in mocks
        ? mocks[s]
        : s === "./RuntimeRouteAge"
          ? { RuntimeRouteAge: () => null }
          : require(s),
    Date,
  });
  return module.exports;
}
function nodes(node) {
  return !node || typeof node !== "object"
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
const session = {
  serverId: "srv_KIFHQ_zsBnI2",
  agentId: "d3caa262-cdcd-454d-9d42-0cd05ac69156",
};
test("real profile Resume copies literal commands and Open uses the reviewed native opener", async () => {
  const copied = [],
    opened = [];
  const command = "launchctl kickstart -k gui/$(id -u)/com.buzz.hermes-agent";
  const mod = load("./AgentRuntimeCard.tsx", {
    "@tauri-apps/plugin-opener": {
      openUrl: async (value) => opened.push(value),
    },
    sonner: { toast: { error: assert.fail } },
    "@/shared/lib/clipboard": {
      copyTextToClipboard: (value) => copied.push(value),
    },
    "@/shared/lib/useNow": { useNow: () => 100_000_000 },
    "./model": { runtimeSessionLink },
    "./preference": {
      useRuntimeCardsEnabled: () => true,
      setRuntimeCardsEnabled: assert.fail,
    },
    "./useAgentRuntime": {
      useAgentRuntime: () => ({
        data: {
          card: { host: "m4", resume: [{ label: "Restart Hermes", command }] },
          attestedAt: 1,
        },
      }),
    },
  });
  const rendered = nodes(mod.AgentRuntimeCard({ pubkey: "agent" }));
  const copy = rendered.find(
    (n) => n.props?.["aria-label"] === "Copy Restart Hermes",
  );
  assert.ok(copy);
  copy.props.onClick();
  assert.deepEqual(copied, [command]);
  assert.ok(
    rendered.some((n) => n.type === "summary" && n.props.children === "Resume"),
  );
  assert.ok(
    rendered.some((n) => n.type === "code" && n.props.children === command),
  );
  const open = mod.OpenRuntimeSession({ session });
  open.props.onClick();
  await Promise.resolve();
  assert.deepEqual(opened, [runtimeSessionLink(session)]);
  assert.equal(
    mod.OpenRuntimeSession({ session: { ...session, serverId: "srv_other" } }),
    null,
  );
});
test("opt-in control starts off and exposes an explicit enable action", () => {
  const saved = [];
  const mod = load("./AgentRuntimeCard.tsx", {
    "@tauri-apps/plugin-opener": { openUrl: assert.fail },
    sonner: { toast: { error: assert.fail } },
    "@/shared/lib/clipboard": { copyTextToClipboard: assert.fail },
    "@/shared/lib/useNow": { useNow: () => 1000 },
    "./model": { runtimeSessionLink },
    "./preference": {
      useRuntimeCardsEnabled: () => false,
      setRuntimeCardsEnabled: (v) => saved.push(v),
    },
    "./useAgentRuntime": { useAgentRuntime: () => ({}) },
  });
  const rendered = nodes(mod.AgentRuntimeCard({ pubkey: "agent" }));
  const input = rendered.find((n) => n.type === "input");
  assert.equal(input.props.checked, false);
  input.props.onChange({ target: { checked: true } });
  assert.deepEqual(saved, [true]);
  assert.equal(
    rendered.some((n) => n.type === "code"),
    false,
  );
});
test("row with no signed card renders no invented host/action; session action is a sibling control", () => {
  for (const data of [
    undefined,
    { card: { host: "m4" } },
    { card: { host: "gcp", session } },
  ]) {
    const mod = load("./AgentRuntimeRow.tsx", {
      "@/shared/context/ProfilePanelContext": { useProfilePanel: () => ({}) },
      "./useAgentRuntime": { useAgentRuntime: () => ({ data }) },
      "./AgentRuntimeCard": { OpenRuntimeSession: () => null },
    });
    assert.equal(mod.AgentRuntimeHost({ pubkey: "agent" }) === null, !data);
    assert.equal(
      mod.AgentRuntimeRowAction({ pubkey: "agent" }) === null,
      !data?.card.session,
    );
  }
});

test("daemon Resume action opens the agent profile and fences drag activation", () => {
  const opened = [];
  const mod = load("./AgentRuntimeRow.tsx", {
    "@/shared/context/ProfilePanelContext": {
      useProfilePanel: () => ({ openProfilePanel: (pk) => opened.push(pk) }),
    },
    "./useAgentRuntime": {
      useAgentRuntime: () => ({
        data: {
          card: {
            host: "m4",
            resume: [{ label: "Restart", command: "inert" }],
          },
        },
      }),
    },
    "./AgentRuntimeCard": { OpenRuntimeSession: () => null },
  });
  const rendered = mod.AgentRuntimeRowAction({ pubkey: "hermes" });
  const button = nodes(rendered).find((n) => n.type === "button");
  assert.equal(button.props.children, "Resume");
  button.props.onClick();
  assert.deepEqual(opened, ["hermes"]);
  let stopped = 0;
  button.props.onPointerDown({ stopPropagation: () => stopped++ });
  button.props.onKeyDown({ stopPropagation: () => stopped++ });
  assert.equal(stopped, 2);
});

test("production hook gates network/data on opt-in and scope; fetch uses exact author coordinate", async () => {
  for (const enabled of [false, true]) {
    for (const origin of [null, "https://community.test"]) {
      let options;
      const requests = [];
      const mod = load("./useAgentRuntime.ts", {
        "@tanstack/react-query": {
          useQuery: (o) => {
            options = o;
            return { data: { card: { host: "gcp" } } };
          },
        },
        "@/shared/api/relayClient": {
          relayClient: {
            fetchEvents: async (f) => {
              requests.push(f);
              return [];
            },
          },
        },
        "@/shared/lib/useRelayOrigin": { useRelayOrigin: () => origin },
        "@/shared/lib/useDocumentVisible": {
          useFocusedRefetchInterval: (n) => n,
        },
        "./model": {
          AGENT_RUNTIME_KIND: 30078,
          AGENT_RUNTIME_D_TAG: "agent-runtime",
          selectRuntimeCard: () => null,
        },
        "./preference": { useRuntimeCardsEnabled: () => enabled },
      });
      // biome-ignore lint/correctness/useHookAtTopLevel: Pure module evaluation with injected hooks, not a React render.
      const result = mod.useAgentRuntime("agent-key");
      assert.equal(options.enabled, enabled && Boolean(origin));
      assert.deepEqual(Array.from(options.queryKey), [
        "agent-runtime",
        origin,
        "agent-key",
      ]);
      assert.equal(Boolean(result.data), enabled && Boolean(origin));
      assert.equal(options.refetchInterval, 60000);
      if (options.enabled) {
        await options.queryFn();
        assert.equal(
          JSON.stringify(requests[0]),
          JSON.stringify({
            kinds: [30078],
            authors: ["agent-key"],
            "#d": ["agent-runtime"],
            limit: 1,
          }),
        );
      }
    }
  }
});

test("row and profile both mount shared Last advertised route clock for the signed timestamp", () => {
  function RuntimeRouteAge() {
    return null;
  }
  const data = { card: { host: "gcp", session }, attestedAt: 123 };
  const common = {
    "./RuntimeRouteAge": { RuntimeRouteAge },
    "./useAgentRuntime": { useAgentRuntime: () => ({ data }) },
    "./model": { runtimeSessionLink },
    "./preference": {
      useRuntimeCardsEnabled: () => true,
      setRuntimeCardsEnabled: assert.fail,
    },
    "@tauri-apps/plugin-opener": { openUrl: assert.fail },
    sonner: { toast: { error: assert.fail } },
    "@/shared/lib/clipboard": { copyTextToClipboard: assert.fail },
    "@/shared/context/ProfilePanelContext": { useProfilePanel: () => ({}) },
    "./AgentRuntimeCard": { OpenRuntimeSession: () => null },
  };
  for (const [file, component] of [
    ["./AgentRuntimeRow.tsx", "AgentRuntimeHost"],
    ["./AgentRuntimeCard.tsx", "AgentRuntimeCard"],
  ]) {
    const tree = nodes(load(file, common)[component]({ pubkey: "agent" }));
    const clock = tree.find((n) => n.type === RuntimeRouteAge);
    assert.ok(clock);
    assert.equal(clock.props.attestedAt, 123);
  }
});

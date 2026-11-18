import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as model from "./model.ts";
const require = createRequire(import.meta.url);
function load(relative, mocks) {
  const js = ts.transpileModule(
    fs.readFileSync(new URL(relative, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) => (s in mocks ? mocks[s] : require(s)),
    console,
    Date,
    Set,
    Map,
    TextEncoder,
    URLSearchParams,
  });
  return module.exports;
}
function nodes(n) {
  return !n || typeof n !== "object"
    ? []
    : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
}
const channel = (id, type, name) => ({
  id,
  channelType: type,
  name,
  visibility: "private",
  isMember: true,
  archivedAt: null,
  participantPubkeys: ["self", "agent"],
  memberPubkeys: ["self", "agent"],
  participants: ["Jacob", "Paseo"],
});
const channels = [
  channel("dm", "dm", "DM"),
  channel("p2", "stream", "Paseo P2"),
];
const sections = {
  version: 1,
  sections: [{ id: "agents", name: "Renamed", order: 0 }],
  assignments: { dm: "agents", p2: "agents" },
};
const message = {
  id: "a".repeat(64),
  kind: 9,
  body: "Please investigate",
  author: "Jacob",
};
function actionHarness(enabled = true) {
  const sends = [],
    errors = [],
    saved = [];
  let current = sections;
  const cleanups = [];
  const successes = [];
  let deferred = false;
  let finish;
  let queryOptions;
  const mod = load("./ForwardToAgentAction.tsx", {
    react: {
      useState: (v) => [v, () => {}],
      useRef: (v) => ({ current: v }),
      useEffect: (fn) => {
        const cleanup = fn();
        if (cleanup) cleanups.push(cleanup);
      },
    },
    "@tanstack/react-query": {
      useQuery: (o) => {
        queryOptions = o;
        return { data: { ids: ["agents"], sections }, refetch: async () => {} };
      },
    },
    sonner: {
      toast: {
        success: (m) => successes.push(m),
        error: (m) => errors.push(m),
      },
    },
    "@/shared/api/hooks": {
      useIdentityQuery: () => ({ data: { pubkey: "self", locked: false } }),
    },
    "@/features/communities/useCommunities": {
      useCommunities: () => ({
        activeCommunity: { relayUrl: "https://relay.test" },
      }),
    },
    "@/shared/context/ChannelNavigationContext": {
      useChannelNavigation: () => ({ channels }),
    },
    "@/features/agents/useKnownAgentPubkeys": {
      useKnownAgentPubkeys: () => new Set(["agent"]),
    },
    "@/features/messages/hooks": {
      useSendMessageMutation: () => ({
        mutateAsync: async (variables) => {
          sends.push(variables);
          if (deferred)
            await new Promise((resolve) => {
              finish = resolve;
            });
          return { id: "b".repeat(64), pubkey: "self" };
        },
      }),
    },
    "@/features/agent-runtime/useAgentRuntime": { useAgentRuntime: () => ({}) },
    "@/shared/ui/button": { Button: "button" },
    "@/shared/ui/dropdown-menu": Object.fromEntries(
      [
        "DropdownMenu",
        "DropdownMenuContent",
        "DropdownMenuItem",
        "DropdownMenuTrigger",
      ].map((n) => [n, n]),
    ),
    "./model": model,
    "./targets": {
      forwardScope: () => "scope",
      loadAgentSectionIds: async () => ["agents"],
      readForwardSections: () => current,
    },
    "./receipts": {
      forwardRevision: async () => "revision",
      forwardOnce: async (...args) => {
        const event = await args[5]();
        saved.push(event);
        return { ...event, label: args[4] };
      },
    },
    "./preference": { useForwardAgentEnabled: () => enabled },
  });
  const wrapper = mod.ForwardToAgentAction({ channelId: "dm", message });
  return {
    tree: wrapper?.type(wrapper.props),
    sends,
    errors,
    saved,
    changeSections: (v) => (current = v),
    queryOptions,
    successes,
    unmount: () =>
      cleanups.forEach((fn) => {
        fn();
      }),
    defer: () => {
      deferred = true;
    },
    finish: () => finish(),
  };
}
test("default-OFF wrapper hides forwarding; one primary click uses captured target/signing scope and no thread parent", async () => {
  assert.equal(actionHarness(false).tree, undefined);
  const h = actionHarness();
  const button = nodes(h.tree).find(
    (n) =>
      n.type === "button" && n.props["aria-label"] === "Forward to P2 (later)",
  );
  assert.ok(button);
  button.props.onClick();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.sends.length, 1);
  assert.equal(h.saved.length, 1);
  assert.equal(h.sends[0].targetChannel.id, "p2");
  assert.equal(h.sends[0].channelId, "p2");
  assert.equal(h.sends[0].parentEventId, null);
  assert.deepEqual(h.sends[0].mentionPubkeys, ["agent"]);
  assert.equal(
    JSON.stringify(h.sends[0].expectedScope),
    JSON.stringify({ relayUrl: "https://relay.test", signerPubkey: "self" }),
  );
  assert.match(h.sends[0].content, /Original message/);
  assert.equal(h.sends[0].sentFromThreadRootId, undefined);
});
test("click revalidates current section membership before any mutation", async () => {
  const h = actionHarness();
  h.changeSections({ ...sections, assignments: {} });
  nodes(h.tree)
    .find(
      (n) =>
        n.type === "button" &&
        n.props["aria-label"] === "Forward to P2 (later)",
    )
    .props.onClick();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.sends.length, 0);
  assert.equal(h.saved.length, 0);
  assert.match(h.errors[0], /Destination changed/);
});
test("production preference defaults off and persists only an explicit toggle", () => {
  const values = new Map();
  const previous = globalThis.localStorage;
  const localStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  const source = fs.readFileSync(
    new URL("./preference.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: () => ({ useSyncExternalStore: (_s, get) => get() }),
    localStorage,
  });
  assert.equal(module.exports.useForwardAgentEnabled(), false);
  module.exports.setForwardAgentEnabled(true);
  assert.equal(module.exports.useForwardAgentEnabled(), true);
  module.exports.setForwardAgentEnabled(false);
  assert.equal(module.exports.useForwardAgentEnabled(), false);
  assert.equal(globalThis.localStorage, previous);
});

test("late acknowledgement saves the captured receipt without a toast in the replacement UI", async () => {
  const h = actionHarness();
  h.defer();
  nodes(h.tree)
    .find(
      (n) =>
        n.type === "button" &&
        n.props["aria-label"] === "Forward to P2 (later)",
    )
    .props.onClick();
  await new Promise((r) => setImmediate(r));
  h.unmount();
  h.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(h.saved.length, 1);
  assert.deepEqual(h.successes, []);
  assert.deepEqual(h.errors, []);
});

test("source marker opens the acknowledged target event, never the source thread or an inaccessible lane", () => {
  const opened = [];
  const receipt = {
    sourceChannelId: "dm",
    sourceId: message.id,
    targetChannelId: "p2",
    targetId: "b".repeat(64),
    label: "P2",
  };
  const mod = load("./ForwardedToAgentLine.tsx", {
    "@/shared/api/hooks": {
      useIdentityQuery: () => ({ data: { pubkey: "self" } }),
    },
    "@/features/communities/useCommunities": {
      useCommunities: () => ({
        activeCommunity: { relayUrl: "https://relay.test" },
      }),
    },
    "@/app/navigation/useAppNavigation": {
      useAppNavigation: () => ({ goChannel: (...args) => opened.push(args) }),
    },
    "@/shared/context/ChannelNavigationContext": {
      useChannelNavigation: () => ({ channels }),
    },
    "./receipts": {
      forwardReceipts: () => [
        receipt,
        { ...receipt, targetChannelId: "not-member", targetId: "c".repeat(64) },
      ],
      useForwardReceiptRevision: () => 0,
    },
    "./targets": { forwardScope: () => "scope" },
    "./preference": { useForwardAgentEnabled: () => true },
  });
  const wrapper = mod.ForwardedToAgentLine({
    channelId: "dm",
    messageId: message.id,
  });
  const rendered = wrapper.type(wrapper.props);
  const buttons = nodes(rendered).filter((n) => n.type === "button");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.children.join(""), "Forwarded to P2 ↗");
  buttons[0].props.onClick();
  assert.equal(
    JSON.stringify(opened),
    JSON.stringify([["p2", { messageId: "b".repeat(64) }]]),
  );
});

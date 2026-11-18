import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as model from "./model.ts";
import * as delivery from "./delivery.ts";
import { audienceKey, needsAudienceConfirmation } from "./audience.ts";
const require = createRequire(import.meta.url);
const channel = (id, count = 2, visibility = "private") => ({
  id,
  name: id === "dm" ? "Paseo" : "Paseo P2",
  channelType: id === "dm" ? "dm" : "stream",
  visibility,
  isMember: true,
  archivedAt: null,
  memberCount: count,
  participantPubkeys: ["self", "agent"],
  memberPubkeys: ["self", "agent"],
});
const audience = (ids, visibility = "private") => ({
  source: {
    channel: channel("dm"),
    members: ["self", "agent"].map((pubkey) => ({
      pubkey,
      displayName: pubkey,
    })),
  },
  target: {
    channel: channel("p2", ids.length, visibility),
    members: ids.map((pubkey) => ({ pubkey, displayName: pubkey })),
  },
});
function harness(initial) {
  const slots = [],
    effects = [];
  let cursor = 0,
    current = initial;
  let currentSections = {
    version: 1,
    sections: [{ id: "agents", name: "Direct agents", order: 0 }],
    assignments: { dm: "agents", p2: "agents" },
  };
  let onRead = () => {};
  const sends = [],
    messages = [],
    errors = [];
  const react = {
    useState: (init) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
      return [
        slots[i],
        (value) =>
          (slots[i] = typeof value === "function" ? value(slots[i]) : value),
      ];
    },
    useRef: (value) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: value };
      return slots[i];
    },
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!effects[i] || JSON.stringify(effects[i]) !== JSON.stringify(deps)) {
        fn();
        effects[i] = deps;
      }
    },
  };
  const mocks = {
    react,
    sonner: { toast: { success: () => {}, error: (e) => errors.push(e) } },
    "./model": model,
    "./delivery": delivery,
    "./audience": {
      audienceKey,
      needsAudienceConfirmation,
      readForwardAudiences: async () => {
        await onRead();
        return current;
      },
    },
    "./receipts": {
      forwardRevision: async () => "hash",
      forwardOnce: async (...args) => {
        const sent = await args[5]();
        return { ...sent, label: args[4] };
      },
    },
    "./targets": {
      readForwardSections: () => currentSections,
    },
  };
  const js = ts.transpileModule(
    fs.readFileSync(
      new URL("./useForwardAgentSend.ts", import.meta.url),
      "utf8",
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) => mocks[s] ?? require(s),
    Error,
  });
  const input = {
    channelId: "dm",
    message: {
      id: "a".repeat(64),
      kind: 9,
      author: "External author",
      pubkey: "e".repeat(64),
      body: "Quoted third-party request",
    },
    signer: "self",
    relayUrl: "https://relay.test",
    scope: "scope",
    channels: [channel("dm"), channel("p2")],
    known: new Set(["agent"]),
    sectionIds: ["agents"],
    send: async (variables) => {
      sends.push(variables);
      messages.push(variables.content);
      return { id: "b".repeat(64), pubkey: "self" };
    },
    closeMenu: () => {},
  };
  return {
    render: () => {
      cursor = 0;
      return module.exports.useForwardAgentSend(input);
    },
    setAudience: (a) => (current = a),
    input,
    setSections: (s) => {
      currentSections = s;
    },
    afterAudienceRead: (fn) => {
      onRead = fn;
    },
    sends,
    messages,
    errors,
  };
}
test("different/broader picker target cannot send until explicit audience confirmation; cancel sends nothing", async () => {
  const h = harness(audience(["self", "agent", "third"]));
  await h.render().forward("p2", "Project");
  assert.equal(h.sends.length, 0);
  assert.equal(h.render().pending.audiences.target.members.length, 3);
  h.render().cancel();
  assert.equal(h.render().pending, null);
  await h.render().confirm();
  assert.equal(h.sends.length, 0);
});
test("audience change after dialog requires fresh consent; one-line sender note stays separate", async () => {
  const h = harness(audience(["self", "agent", "third"]));
  h.render().setNote("Summarize without acting");
  await h.render().forward("p2", "Project");
  h.setAudience(audience(["self", "agent", "third", "fourth"]));
  await h.render().confirm();
  assert.equal(h.sends.length, 0);
  assert.equal(h.render().pending.audiences.target.members.length, 4);
  await h.render().confirm();
  assert.equal(h.sends.length, 1);
  assert.match(h.messages[0], /^Sender note .*\nSummarize without acting/);
  assert.ok(
    h.messages[0].indexOf("Quoted third-party request") >
      h.messages[0].indexOf("BEGIN QUOTED ORIGINAL"),
  );
});
test("open target with same current member keys still prompts; unchanged private DM/P2 can remain one click", async () => {
  const publicTarget = harness(audience(["self", "agent"], "open"));
  await publicTarget.render().forward("p2", "Open target");
  assert.equal(publicTarget.sends.length, 0);
  assert.ok(publicTarget.render().pending);
  const same = harness(audience(["self", "agent"]));
  await same.render().forward("p2", "P2 (later)", true);
  assert.equal(same.sends.length, 1);
  assert.equal(same.render().pending, null);
});

test("audience dialog names members and exposes only an explicit confirm action", () => {
  const source = fs.readFileSync(
    new URL("./ForwardAudienceConfirm.tsx", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const mockDialog = Object.fromEntries(
    [
      "AlertDialog",
      "AlertDialogCancel",
      "AlertDialogContent",
      "AlertDialogDescription",
      "AlertDialogFooter",
      "AlertDialogHeader",
      "AlertDialogTitle",
    ].map((k) => [k, k]),
  );
  let sends = 0,
    cancels = 0;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) =>
      s === "@/shared/ui/alert-dialog"
        ? mockDialog
        : s === "@/shared/ui/button"
          ? { Button: "button" }
          : s === "./audience"
            ? { audienceDescription: (a) => a.channel.name }
            : require(s),
  });
  const tree = module.exports.ForwardAudienceConfirm({
    audiences: audience(["self", "agent", "third"]),
    targetLabel: "Project agent",
    note: "Reference only",
    busy: false,
    onCancel: () => cancels++,
    onConfirm: () => sends++,
  });
  const nodes = (n) =>
    !n || typeof n !== "object"
      ? []
      : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)];
  assert.equal(sends, 0);
  const all = nodes(tree);
  assert.ok(
    all.some(
      (n) => n.type === "ul" && n.props["aria-label"] === "Target audience",
    ),
  );
  assert.equal(all.filter((n) => n.type === "li").length, 3);
  all
    .find((n) => n.type === "button" && n.props.children === "Cancel")
    .props.onClick();
  assert.equal(cancels, 1);
  assert.equal(sends, 0);
  all
    .find(
      (n) =>
        n.type === "button" &&
        n.props.children === "Confirm audience and forward",
    )
    .props.onClick();
  assert.equal(sends, 1);
});

test("live unassignment during async audience checks blocks dispatch, as does agent roster or scope loss", async () => {
  for (const change of [
    (h) =>
      h.setSections({
        version: 1,
        sections: [{ id: "agents", name: "Direct agents", order: 0 }],
        assignments: { dm: "agents" },
      }),
    (h) => {
      h.input.known = new Set();
      h.render();
    },
    (h) => {
      h.input.scope = "new identity";
      h.render();
    },
  ]) {
    const h = harness(audience(["self", "agent"]));
    h.afterAudienceRead(() => change(h));
    await h.render().forward("p2", "P2 (later)", true);
    assert.equal(h.sends.length, 0);
  }
});

test("post-mutation malformed ACK guidance differs from preflight, definite rejection and marker-only recovery", async () => {
  for (const detail of [
    "relay returned malformed response: not valid JSON",
    "Forward acknowledgement did not match the captured signer.",
    "unexpected native error",
  ]) {
    const h = harness(audience(["self", "agent"]));
    h.input.send = async () => {
      throw Error(detail);
    };
    await h.render().forward("p2", "P2 (later)", true);
    assert.match(h.errors[0], /Check the target before retrying\./);
  }
  for (const error of [
    new Error("relay rejected event: permission denied"),
    new delivery.ForwardMarkerError(
      "Forward sent, but its marker could not be saved. Choose the same target to retry only the marker.",
    ),
  ]) {
    const h = harness(audience(["self", "agent"]));
    h.input.send = async () => {
      throw error;
    };
    await h.render().forward("p2", "P2 (later)", true);
    assert.equal(h.errors[0], error.message);
  }
  const h = harness(audience(["self", "agent"]));
  h.setSections({ version: 1, sections: [], assignments: {} });
  await h.render().forward("p2", "P2 (later)", true);
  assert.equal(h.sends.length, 0);
  assert.doesNotMatch(h.errors[0], /Check the target/);
});

test("stale confirmation is refused even when a broader audience becomes the same private pair", async () => {
  const h = harness(audience(["self", "agent", "third"]));
  await h.render().forward("p2", "Project");
  h.setAudience(audience(["self", "agent"]));
  await h.render().confirm();
  assert.equal(h.sends.length, 0);
  assert.equal(h.render().pending.audiences.target.members.length, 2);
  assert.match(h.errors[0], /audience changed/);
  await h.render().confirm();
  assert.equal(h.sends.length, 1);
});

test("private-to-open same-roster change invalidates a pending audience key", async () => {
  const h = harness(audience(["self", "agent", "third"]));
  await h.render().forward("p2", "Project");
  h.setAudience(audience(["self", "agent", "third"], "open"));
  await h.render().confirm();
  assert.equal(h.sends.length, 0);
  assert.equal(h.render().pending.audiences.target.channel.visibility, "open");
  await h.render().confirm();
  assert.equal(h.sends.length, 1);
});

test("cancel/dismiss clears abandoned note; primary shortcut is always reference-only", async () => {
  const h = harness(audience(["self", "agent", "third"]));
  h.render().setNote("Instruction for another agent");
  await h.render().forward("p2", "Project");
  h.render().cancel();
  assert.equal(h.render().note, "");
  h.setAudience(audience(["self", "agent"]));
  await h.render().forward("p2", "P2 (later)", true);
  assert.match(h.messages[0], /^Sender note: none\./);
  assert.doesNotMatch(h.messages[0], /Instruction for another agent/);
  h.render().setNote("Dismissed instruction");
  h.render().dismissNote();
  assert.equal(h.render().note, "");
  h.render().setNote("Hidden note even without dismiss");
  await h.render().forward("p2", "P2 (later)", true);
  assert.doesNotMatch(h.messages[1], /Hidden note/);
  assert.equal(h.render().note, "");
});

test("A-to-B-to-A view generation change cancels the original pending forward before publication", async () => {
  const h = harness(audience(["self", "agent"]));
  h.afterAudienceRead(() => {
    h.input.scope = "other identity";
    h.render();
    h.input.scope = "scope";
    h.render();
  });
  await h.render().forward("p2", "P2 (later)", true);
  assert.equal(h.sends.length, 0);
});

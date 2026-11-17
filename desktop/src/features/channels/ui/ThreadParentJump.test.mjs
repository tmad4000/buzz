import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Execute the actual owning-pane callback, including both edit guards. The chip
// must not route globally or use the composer reply-target action for a jump.
const source = ts.createSourceFile(
  "ChannelScreen.tsx",
  readFileSync(new URL("./ChannelScreen.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback;
function visit(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(source) === "handleJumpToThreadMessage"
  )
    callback = node.initializer.arguments[0].getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(callback);
function owner({
  currentRoot = "root",
  pageAllowed = true,
  threadAllowed = true,
} = {}) {
  const calls = [];
  const state = {
    replyTarget: "newer-draft-target",
    draft: "Keep this exact newer draft",
  };
  const env = {
    effectiveOpenThreadHeadId: currentRoot,
    requirePageEditResolution: () => {
      calls.push(["page-guard"]);
      return pageAllowed;
    },
    requireThreadEditResolution: () => {
      calls.push(["thread-guard"]);
      return threadAllowed;
    },
  };
  for (const name of [
    "setOpenAgentSessionPubkey",
    "setProfilePanelPubkey",
    "setChannelManagementOpen",
    "setOptimisticOpenThreadHeadId",
    "setOpenThreadHeadId",
    "setThreadReplyTargetId",
    "setThreadScrollTargetId",
  ]) {
    env[name] = (value) => {
      calls.push([name, value]);
      if (name === "setThreadReplyTargetId") state.replyTarget = value;
    };
  }
  const code = ts.transpile(`const jump = (${callback});`, {
    target: ts.ScriptTarget.ES2022,
  });
  return {
    jump: new Function(...Object.keys(env), `${code}\nreturn jump;`)(
      ...Object.values(env),
    ),
    calls,
    state,
  };
}
test("owning pane rejects quote navigation before changing any state when Page or thread edit guard refuses", () => {
  const page = owner({ pageAllowed: false });
  page.jump("root", "parent");
  assert.deepEqual(page.calls, [["page-guard"]]);
  const thread = owner({ threadAllowed: false });
  thread.jump("root", "parent");
  assert.deepEqual(thread.calls, [["page-guard"], ["thread-guard"]]);
  assert.equal(thread.state.replyTarget, "newer-draft-target");
});
test("same-thread parent jump exposes an exact target without retargeting the newer composer draft", () => {
  const h = owner();
  h.jump("root", "parent");
  assert.deepEqual(h.calls.slice(0, 2), [["page-guard"], ["thread-guard"]]);
  assert.ok(
    h.calls.some(
      ([name, value]) => name === "setOpenThreadHeadId" && value === "root",
    ),
  );
  assert.ok(
    h.calls.some(
      ([name, value]) =>
        name === "setThreadScrollTargetId" && value === "parent",
    ),
  );
  assert.equal(
    h.calls.some(([name]) => name === "setThreadReplyTargetId"),
    false,
  );
  assert.deepEqual(h.state, {
    replyTarget: "newer-draft-target",
    draft: "Keep this exact newer draft",
  });
});
test("opening a different thread sets only its root as the default composer target, not the navigation parent", () => {
  const h = owner({ currentRoot: "other-root" });
  h.jump("native-root", "exact-parent");
  assert.equal(h.state.replyTarget, "native-root");
  assert.ok(
    h.calls.some(
      ([name, value]) =>
        name === "setThreadScrollTargetId" && value === "exact-parent",
    ),
  );
  assert.equal(h.state.draft, "Keep this exact newer draft");
});

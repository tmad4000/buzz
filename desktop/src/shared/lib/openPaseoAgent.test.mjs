import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { paseoAgentTarget } from "./paseoAgentTarget.ts";
const id = "075fe138-b9c6-4277-80d6-addd30e38cf3";
const canonical = `paseo://h/srv_KIFHQ_zsBnI2/agent/${id}`;
function load(io) {
  const module = { exports: {} };
  const js = ts.transpileModule(
    fs.readFileSync(new URL("./openPaseoAgent.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) => {
      if (s === "@tauri-apps/plugin-opener") return { openUrl: io.open };
      if (s === "sonner")
        return { toast: { error: (...args) => io.errors.push(args) } };
      if (s === "./clipboard")
        return { copyTextToClipboard: (...args) => io.copied.push(args) };
      if (s === "./paseoAgentTarget") return { paseoAgentTarget };
      throw Error(s);
    },
  });
  return module.exports;
}
test("canonical and Fork agent sessions target only the registered Fork scheme and approved hosts", async () => {
  const opened = [],
    errors = [],
    copied = [];
  const mod = load({ open: async (href) => opened.push(href), errors, copied });
  for (const server of [
    "srv_KIFHQ_zsBnI2",
    "srv_uvq8mbWTDr9Y",
    "srv_xmGYpGqxNnXR",
  ])
    for (const scheme of ["paseo", "paseo-fork"])
      await mod.openPaseoAgent(`${scheme}://h/${server}/agent/${id}`);
  assert.equal(opened.length, 6);
  assert.ok(opened.every((href) => href.startsWith("paseo-fork://")));
  assert.equal(errors.length, 0);
  assert.equal(copied.length, 0);
});
test("native failure exposes exact agent id/server and an explicit copy action without retrying stock/web", async () => {
  const opened = [],
    errors = [],
    copied = [];
  const mod = load({
    open: async (href) => {
      opened.push(href);
      throw Error("no application registered");
    },
    errors,
    copied,
  });
  await mod.openPaseoAgent(canonical);
  assert.deepEqual(opened, [canonical.replace("paseo:", "paseo-fork:")]);
  assert.equal(errors.length, 1);
  const [label, options] = errors[0];
  assert.equal(label, "Could not open Paseo Fork");
  assert.match(options.description, new RegExp(id));
  assert.match(options.description, /srv_KIFHQ_zsBnI2/);
  assert.equal(options.action.label, "Copy agent ID");
  assert.equal(copied.length, 0);
  await options.action.onClick();
  assert.deepEqual(copied, [[id, "Agent ID copied"]]);
  assert.equal(opened.length, 1);
});
test("other schemes/actions/malformed links never open, and an unknown host fails closed with copy identity", async () => {
  const opened = [],
    errors = [],
    copied = [];
  const mod = load({ open: async (href) => opened.push(href), errors, copied });
  for (const href of [
    "javascript:alert(1)",
    "paseo-fork://settings",
    canonical + "?action=send",
    canonical + "#prompt",
    canonical + "/extra",
    canonical + "\n",
    canonical.replace("/h/", "/user@h/"),
    canonical.replace(id, id.toUpperCase()),
  ]) {
    assert.equal(paseoAgentTarget(href), null);
    await mod.openPaseoAgent(href);
  }
  await mod.openPaseoAgent(
    canonical.replace("srv_KIFHQ_zsBnI2", "srv_unknownHost"),
  );
  assert.equal(opened.length, 0);
  assert.ok(errors.at(-1)[1].action);
  assert.equal(copied.length, 0);
});

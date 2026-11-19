import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { forkVersion } from "../forkRelease.ts";
const version = "0.5.28-ideaflow.10";
const current = "0.5.28-ideaflow.9";
function candidate() {
  return {
    version,
    currentVersion: current,
    rawJson: {
      version,
      platforms: {
        "darwin-aarch64": {
          signature: "existing signed release metadata",
          url: `https://github.com/tmad4000/buzz/releases/download/buzz-ideaflow-v${version}/Buzz.app.tar.gz`,
        },
      },
    },
  };
}
function load({ native = true, platform = "MacIntel", supported = true } = {}) {
  const calls = [];
  let result = candidate();
  const update = { ...result, close: async () => calls.push("close") };
  result = update;
  const mocks = {
    "@tauri-apps/api/core": { isTauri: () => native },
    "@tauri-apps/plugin-updater": {
      check: async (options) => {
        calls.push(options);
        return result;
      },
    },
    "@/shared/api/tauri": { isAutoUpdateSupported: async () => supported },
    "../forkRelease": { forkVersion },
  };
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(
      fs.readFileSync(
        new URL("./signedForkUpdate.ts", import.meta.url),
        "utf8",
      ),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText,
    {
      module,
      exports: module.exports,
      require: (s) => {
        assert.ok(s in mocks, s);
        return mocks[s];
      },
      URL,
      navigator: { platform },
    },
  );
  return {
    ...module.exports,
    calls,
    update,
    set: (value) => {
      result = value;
    },
  };
}
test("only a newer numbered fork release on exact own GitHub signed-asset metadata is eligible", () => {
  const { isNewerSignedForkCandidate: valid } = load();
  assert.equal(valid(candidate(), current), true);
  for (const change of [
    (v) => {
      v.version = current;
    },
    (v) => {
      v.version = "0.5.29";
    },
    (v) => {
      v.currentVersion = "0.5.28-ideaflow.8";
    },
    (v) => {
      v.rawJson.platforms["darwin-aarch64"].signature = "";
    },
    (v) => {
      v.rawJson.platforms["darwin-aarch64"].url =
        "https://github.com/block/buzz/releases/download/latest/app.tar.gz";
    },
    (v) => {
      v.rawJson.platforms["darwin-aarch64"].url =
        "http://github.com/tmad4000/buzz/releases/download/latest/app.tar.gz";
    },
    (v) => {
      v.rawJson.platforms = {};
    },
  ]) {
    const value = candidate();
    change(value);
    assert.equal(valid(value, current), false);
  }
});
test("native discovery never downloads, changes a key/feed or enables downgrade", async () => {
  const f = load();
  assert.equal(await f.discoverSignedForkUpdate(current), f.update);
  assert.equal(f.calls.length, 1);
  assert.equal(
    JSON.stringify(f.calls[0]),
    JSON.stringify({ timeout: 15000, allowDowngrades: false }),
  );
});
test("browser, Windows immediate-exit installer and unsupported package remain manual without IPC check", async () => {
  for (const options of [
    { native: false },
    { platform: "Win32" },
    { supported: false },
  ]) {
    const f = load(options);
    assert.equal(await f.discoverSignedForkUpdate(current), null);
    assert.deepEqual(f.calls, []);
  }
});
test("rejected channel metadata closes the native resource instead of offering install", async () => {
  const f = load();
  f.update.version = "0.5.29";
  assert.equal(await f.discoverSignedForkUpdate(current), null);
  assert.equal(f.calls.at(-1), "close");
});

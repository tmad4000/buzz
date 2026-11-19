import { test } from "node:test";
import { registerHooks } from "node:module";
import assert from "node:assert/strict";
import React from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";
registerHooks({
  resolve(s, c, n) {
    if (s === "./signedForkUpdate")
      return { shortCircuit: true, url: "updater-test:discovery" };
    if (s === "@tauri-apps/plugin-process")
      return { shortCircuit: true, url: "updater-test:process" };
    return n(s, c);
  },
  load(u, c, n) {
    if (u === "updater-test:discovery")
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export const discoverSignedForkUpdate=async(current)=>globalThis.__signedUpdateDiscovery?.(current)??null;",
      };
    if (u === "updater-test:process")
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export const relaunch=async()=>globalThis.__signedUpdateRelaunch();",
      };
    return n(u, c);
  },
});
const { useUpdater } = await import("./use-updater.ts");

test("StrictMode starts discovery and a concurrent manual check receives failure and can retry", async () => {
  const original = globalThis.fetch;
  let reject;
  let calls = 0;
  globalThis.fetch = () => {
    calls++;
    return new Promise((_, fail) => {
      reject = fail;
    });
  };
  let updater;
  function Probe() {
    updater = useUpdater();
    return React.createElement("span", null, updater.status.state);
  }
  try {
    render(
      React.createElement(React.StrictMode, null, React.createElement(Probe)),
    );
    await waitFor(() => assert.equal(calls, 1));
    await act(async () => {
      void updater.checkForUpdate();
    });
    assert.equal(updater.status.state, "checking");
    await act(async () => {
      reject(new Error("offline"));
    });
    await waitFor(() => assert.equal(updater.status.state, "error"));
    globalThis.fetch = async () => ({ ok: true, json: async () => [] });
    await act(async () => {
      await updater.checkForUpdate();
    });
    assert.equal(updater.status.state, "unavailable");
  } finally {
    cleanup();
    globalThis.fetch = original;
  }
});

test("background signed discovery only offers Restart; exactly one explicit action downloads/installs/relaunches", async () => {
  const original = globalThis.fetch;
  const calls = [];
  let finish;
  globalThis.fetch = async () =>
    assert.fail("signed resource must not come from GitHub list fallback");
  globalThis.__signedUpdateDiscovery = async () => ({
    version: "0.5.28-ideaflow.10",
    download: async () => {
      calls.push("verify-download");
      await new Promise((r) => {
        finish = r;
      });
    },
    install: async () => calls.push("install"),
    close: async () => calls.push("close"),
  });
  globalThis.__signedUpdateRelaunch = async () => calls.push("restart-request");
  let updater;
  function Probe() {
    updater = useUpdater();
    return React.createElement("span", null, updater.status.state);
  }
  try {
    render(React.createElement(Probe));
    await waitFor(() => assert.equal(updater.status.state, "available"));
    assert.deepEqual(calls, []);
    let first;
    await act(async () => {
      first = updater.installAndRelaunch();
      await updater.installAndRelaunch();
    });
    assert.deepEqual(calls, ["verify-download"]);
    await act(async () => {
      finish();
      await first;
    });
    assert.deepEqual(calls, ["verify-download", "install", "restart-request"]);
    assert.equal(updater.status.state, "ready");
  } finally {
    cleanup();
    await Promise.resolve();
    globalThis.fetch = original;
    delete globalThis.__signedUpdateDiscovery;
    delete globalThis.__signedUpdateRelaunch;
  }
  assert.equal(calls.filter((v) => v === "close").length, 1);
});

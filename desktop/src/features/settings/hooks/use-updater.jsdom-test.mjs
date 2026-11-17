import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render, waitFor, cleanup, act } from "@testing-library/react";
import { useUpdater } from "./use-updater.ts";

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

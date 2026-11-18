import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { deferConnectedMenuAction } from "@/features/sidebar/ui/sidebarMenuHelpers";
import { addHuddleAgentAfterStart } from "@/features/huddle/components/huddleAddConnection";
import { invokeTauri } from "./tauri.ts";
import { relayClient } from "./relayClient.ts";
test("UI1 deferred assignment/create/removal and delayed Huddle start recheck connection at actual mutation", async () => {
  const dom = new JSDOM("", { url: "http://test" });
  globalThis.window = dom.window;
  globalThis.isTauri = true;
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
  window.localStorage.setItem("buzz-offline-cache-v1", "on");
  relayClient.connectionStateEmitter.set("connected");
  const mutations = [];
  window.__TAURI_INTERNALS__ = {
    invoke: async (command) => {
      mutations.push(command);
    },
  };
  try {
    for (const action of ["assign", "create", "remove"])
      deferConnectedMenuAction(() => mutations.push(action));
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(mutations, []);
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    relayClient.connectionStateEmitter.set("connected");
    let release;
    const waiting = addHuddleAgentAfterStart(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
      () => invokeTauri("add_agent_to_huddle", { agentPubkey: "agent" }),
    );
    relayClient.connectionStateEmitter.set("disconnected");
    release();
    await assert.rejects(waiting, /Needs a connection/);
    assert.deepEqual(mutations, []);
    await assert.rejects(
      invokeTauri("add_agent_to_huddle", { agentPubkey: "agent" }),
      /Needs a connection/,
    );
    assert.deepEqual(mutations, []);
    relayClient.connectionStateEmitter.set("connected");
    await addHuddleAgentAfterStart(
      async () => {},
      () => invokeTauri("add_agent_to_huddle", { agentPubkey: "agent" }),
    );
    assert.deepEqual(mutations, ["add_agent_to_huddle"]);
  } finally {
    window.localStorage.clear();
    dom.window.close();
  }
});

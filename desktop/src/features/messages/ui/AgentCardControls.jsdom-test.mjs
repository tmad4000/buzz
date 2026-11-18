import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test, beforeEach } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
registerHooks({
  resolve(s, c, n) {
    const mocks = {
      "@/shared/api/hooks": "identity",
      "@/shared/api/tauri": "native",
      "@/features/communities/communityStorage": "community",
      "@/shared/features": "features",
    };
    if (mocks[s]) return { shortCircuit: true, url: "control-dom:" + mocks[s] };
    return n(s, c);
  },
  load(u, c, n) {
    const sources = {
      "control-dom:identity":
        "export const useIdentityQuery=()=>({data:globalThis.__controlIdentity});",
      "control-dom:community":
        "export const loadActiveCommunityId=()=>globalThis.__controlCommunity; export const loadCommunities=()=>[{id:'community',relayUrl:'wss://relay.example'}];",
      "control-dom:features":
        "export const useFeatureEnabled=()=>globalThis.__controlFeature;",
      "control-dom:native":
        'export const getRelayHttpUrl=async()=>{if(globalThis.__controlGetRelay)await globalThis.__controlGetRelay();return "https://relay.example";}; export const invokeTauri=async(command,args)=>{globalThis.__controlSends.push({command,args});if(globalThis.__controlError)throw Error("ambiguous");return {event_id:"f".repeat(64),signed_event:{},created_at:1};};',
    };
    if (sources[u])
      return { shortCircuit: true, format: "module", source: sources[u] };
    return n(u, c);
  },
});
const { AgentCardControls } = await import("./AgentCardControls.tsx");
beforeEach(() => localStorage.removeItem("buzz.agent-control-holds.v1"));
const agent = "9e03d4e0-1234-4567-8901-234567890abc";
const base = {
  id: "a".repeat(64),
  kind: 9,
  bodyRevision: {eventId:"a".repeat(64),createdAt:100},
  parentId: "b".repeat(64),
  signerPubkey:
    "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb",
  tags: [
    ["h", "channel"],
    ["e", "b".repeat(64), "", "reply"],
  ],
};
const body = (label = "⏳ Working", source = "root", id = agent) =>
  `${label} — Worker · model unavailable (codex)\nAgent \`${id}\` · server \`srv_KIFHQ_zsBnI2\`\n[Open agent](paseo://h/srv_KIFHQ_zsBnI2/agent/${id})\nReported status · source: ${source}`;
function setup() {
  Object.assign(globalThis, {
    __controlIdentity: {
      pubkey:
        "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f",
    },
    __controlCommunity: "community",
    __controlFeature: true,
    __controlSends: [],
    __controlError: false,
    __controlGetRelay: null,
  });
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  return {
    element,
    root,
    render: async (message = { ...base, body: body() }) =>
      act(() =>
        root.render(
          React.createElement(AgentCardControls, {
            message,
            channelId: "channel",
          }),
        ),
      ),
    close: async () => {
      await act(() => root.unmount());
      element.remove();
    },
  };
}
const button = (text) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === text);
test("Stop requires confirmation, publishes exact card reply once, and waits for signed bridge state", async () => {
  const f = setup();
  try {
    await f.render();
    await act(() => button("Stop…").click());
    assert.ok(document.querySelector('[role="alertdialog"]'));
    assert.equal(globalThis.__controlSends.length, 0);
    await act(() => button("Keep working").click());
    assert.equal(globalThis.__controlSends.length, 0);
    await act(() => button("Stop…").click());
    await act(() => button("Send Stop request").click());
    assert.equal(globalThis.__controlSends.length, 1);
    assert.equal(globalThis.__controlSends[0].args.content, "stop");
    assert.equal(globalThis.__controlSends[0].args.parentEventId, base.id);
    assert.match(f.element.textContent, /Waiting for the bridge/);
    assert.equal(button("Stop…").disabled, true);
    assert.doesNotMatch(f.element.textContent, /Stopped by Jacob/);
    await f.render({
      ...base,
      body: body("🛑 Stopped by Jacob at 03:18 UTC", "jacob"),
      bodyRevision: {eventId:"c".repeat(64),createdAt:101},
    });
    await act(() => button("Continue").click());
    assert.equal(globalThis.__controlSends[1].args.content, "continue");
    assert.equal(globalThis.__controlSends[1].args.parentEventId, base.id);
    assert.match(f.element.textContent, /Waiting for the bridge/);
  } finally {
    await f.close();
  }
});
test("wrong identity, feature OFF, Root and nonbridge cards have no controls", async () => {
  const f = setup();
  try {
    globalThis.__controlFeature = false;
    await f.render();
    assert.equal(f.element.textContent, "");
    globalThis.__controlFeature = true;
    globalThis.__controlIdentity = { pubkey: "other" };
    await f.render();
    assert.equal(f.element.textContent, "");
    globalThis.__controlIdentity = {
      pubkey:
        "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f",
    };
    await f.render({
      ...base,
      body: body("⏳ Working", "root", "d3caa262-cdcd-454d-9d42-0cd05ac69156"),
    });
    assert.equal(f.element.textContent, "");
    await f.render({ ...base, signerPubkey: "other", body: body() });
    assert.equal(f.element.textContent, "");
    assert.equal(globalThis.__controlSends.length, 0);
  } finally {
    await f.close();
  }
});
test("card reassignment and community switch during confirmation never emit a stale trigger", async () => {
  const f = setup();
  try {
    await f.render();
    await act(() => button("Stop…").click());
    await f.render({
      ...base,
      body: body("⏳ Working", "root", "7e03d4e0-1234-4567-8901-234567890abc"),
    });
    assert.equal(document.querySelector('[role="alertdialog"]'), null);
    assert.equal(globalThis.__controlSends.length, 0);
    await act(() => button("Stop…").click());
    let release;
    globalThis.__controlGetRelay = () => new Promise((r) => (release = r));
    await act(() => button("Send Stop request").click());
    globalThis.__controlCommunity = "different";
    await act(() => release());
    assert.equal(globalThis.__controlSends.length, 0);
    assert.equal(
      f.element.textContent,
      "",
      "old community controls disappear without a stale trigger",
    );
  } finally {
    await f.close();
  }
});
test("ambiguous send never changes lifecycle state or automatically retries", async () => {
  const f = setup();
  try {
    globalThis.__controlError = true;
    await f.render({
      ...base,
      body: body("🛑 Stopped by Jacob at 03:18 UTC", "jacob"),
    });
    await act(() => button("Continue").click());
    assert.equal(globalThis.__controlSends.length, 1);
    assert.equal(button("Continue").disabled, true);
    assert.match(f.element.textContent, /Delivery unconfirmed/);
    await f.render({
      ...base,
      body: body("🛑 Stopped by Jacob at 03:18 UTC", "jacob"),
    });
    assert.equal(globalThis.__controlSends.length, 1);
  } finally {
    await f.close();
  }
});

test("unmount while capturing relay scope prevents a late control publication", async () => {
  const f = setup();
  let closed = false;
  try {
    await f.render({
      ...base,
      body: body("🛑 Stopped by Jacob at 03:18 UTC", "jacob"),
    });
    let release;
    globalThis.__controlGetRelay = () => new Promise((r) => (release = r));
    await act(() => button("Continue").click());
    await f.close();
    closed = true;
    await act(() => release());
    assert.equal(globalThis.__controlSends.length, 0);
  } finally {
    if (!closed) await f.close();
  }
});

test("Cancel and Escape restore focus to the actual Stop trigger", async () => {
  const f = setup();
  try {
    await f.render();
    button("Stop…").focus();
    await act(() => button("Stop…").click());
    await act(() => button("Keep working").click());
    assert.equal(document.activeElement?.textContent, "Stop…");
    await act(() => button("Stop…").click());
    await act(() => document.dispatchEvent(new KeyboardEvent("keydown", {key:"Escape", bubbles:true})));
    assert.equal(document.activeElement?.textContent, "Stop…");
  } finally { await f.close(); }
});
test("Uncertain intent survives display edits, remount, and a second view", async () => {
  let f = setup();
  const stopped = {...base, body:body("🛑 Stopped by Jacob at 03:18 UTC", "jacob")};
  try {
    globalThis.__controlError = true;
    await f.render(stopped);
    await act(() => button("Continue").click());
    await f.render({...stopped, body:stopped.body.replace("Worker", "Renamed")});
    assert.equal(button("Continue").disabled, true);
    await f.close();
    f = setup();
    await f.render(stopped);
    assert.equal(button("Continue").disabled, true);
    const second = setup();
    try {
      await second.render(stopped);
      assert.equal(second.element.querySelector("button").disabled, true);
    } finally { await second.close(); }
    await f.render({...base, body:body("Continuation queued by Jacob at 03:19 UTC", "jacob"),bodyRevision:{eventId:"d".repeat(64),createdAt:102}});
    assert.equal(button("Stop…").disabled, false);
  } finally { await f.close(); }
});

test("older or unversioned control report in another view cannot clear a newer ambiguous Continue", async () => {
  const current=setup();
  const stopped={...base,body:body("🛑 Stopped by Jacob at 03:18 UTC","jacob"),bodyRevision:{eventId:"c".repeat(64),createdAt:101}};
  try {
    globalThis.__controlError=true;
    await current.render(stopped);
    await act(()=>button("Continue").click());
    for(const revision of [
      {eventId:"b".repeat(64),createdAt:100},
      {eventId:"b".repeat(64),createdAt:101},
      undefined,
    ]) {
      const stale=setup();
      try {
        await stale.render({...base,body:body("Continuation queued by Jacob at 03:17 UTC","jacob"),bodyRevision:revision});
        assert.equal(current.element.querySelector("button").disabled,true);
      } finally {await stale.close();}
    }
    await current.render({...stopped,body:body("Continuation queued by Jacob at 03:19 UTC","jacob"),bodyRevision:{eventId:"d".repeat(64),createdAt:102}});
    assert.equal(current.element.querySelector("button").disabled,false);
  } finally {await current.close();}
});

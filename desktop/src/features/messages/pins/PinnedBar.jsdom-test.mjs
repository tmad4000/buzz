import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
registerHooks({
  resolve(s, c, n) {
    if (s === "@/shared/api/relayClient")
      return { shortCircuit: true, url: "pin-fixture:relay" };
    if (s === "@/shared/api/tauri")
      return { shortCircuit: true, url: "pin-fixture:tauri" };
    return n(s, c);
  },
  load(u, c, n) {
    if (u === "pin-fixture:relay")
      return {
        shortCircuit: true,
        format: "module",
        source: "export const relayClient=globalThis.pinRelay;",
      };
    if (u === "pin-fixture:tauri")
      return {
        shortCircuit: true,
        format: "module",
        source:
          'export async function signRelayEvent(e){return {...e,id:"signed",pubkey:"alice",created_at:e.createdAt??100};}',
      };
    return n(u, c);
  },
});
test("shipping pinned bar hydrates an old pin, displays edit, opens source and unpins", async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const target = "a".repeat(64);
  let receive;
  let opened;
  let published;
  const pin = {
    id: "1",
    kind: 40004,
    content: "pin",
    created_at: 1,
    pubkey: "alice",
    tags: [
      ["h", "channel"],
      ["e", target],
    ],
  };
  globalThis.pinRelay = {
    subscribeLive: async (_f, cb) => {
      receive = cb;
      return () => {};
    },
    fetchEvents: async (f) =>
      f.kinds[0] === 40004
        ? [pin]
        : f.kinds[0] === 9
          ? [
              {
                id: target,
                pubkey: "alice",
                content: "Now working on: old",
                tags: [["h", "channel"]],
              },
            ]
          : f.kinds[0] === 40003
            ? [
                {
                  id: "edit",
                  pubkey: "alice",
                  created_at: 2,
                  content: "Now working on: current",
                  tags: [["e", target]],
                },
              ]
            : [],
    publishEvent: async (e) => {
      published = e;
      receive({ ...e, id: "2", created_at: 100 });
    },
  };
  const { PinnedBar } = await import("./PinnedBar.tsx");
  const root = createRoot(document.getElementById("root"));
  await act(async () => {
    root.render(
      React.createElement(PinnedBar, {
        channel: "channel",
        pubkey: "alice",
        onOpen: (id) => (opened = id),
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
  });
  assert.match(document.body.textContent, /Now working on: current/);
  const buttons = document.querySelectorAll("button");
  await act(async () => buttons[0].click());
  assert.equal(opened, target);
  await act(async () => {
    buttons[1].click();
    await new Promise((r) => setTimeout(r, 20));
  });
  assert.equal(published.content, "unpin");
  assert.equal(document.querySelector("aside"), null);
  await act(async () => root.unmount());
  dom.window.close();
  delete globalThis.pinRelay;
});

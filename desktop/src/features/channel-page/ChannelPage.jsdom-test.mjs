import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
registerHooks({
  resolve(s, c, n) {
    const modules = {
      "@/shared/api/relayClient": "relay",
      "@/shared/api/tauri": "tauri",
      "@/features/profile/hooks": "profile",
      "@/shared/ui/button": "button",
      "@tauri-apps/plugin-opener": "opener",
    };
    return modules[s]
      ? { shortCircuit: true, url: `page-fixture:${modules[s]}` }
      : n(s, c);
  },
  load(u, c, n) {
    const sources = {
      relay: "export const relayClient=globalThis.pageRelay;",
      tauri:
        'export async function signRelayEvent(e){return {...e,id:"signed",pubkey:"alice",created_at:e.createdAt??100};}',
      profile:
        'export function useUserProfileQuery(){return {data:{displayName:"Alice"}}}',
      button:
        'export function Button({children,size,variant,...props}){return globalThis.pageReact.createElement("button",props,children)}',
      opener: "export async function openUrl(url){globalThis.pageOpened=url;}",
    };
    const source = sources[u.replace("page-fixture:", "")];
    return u.startsWith("page-fixture:")
      ? { shortCircuit: true, format: "module", source }
      : n(u, c);
  },
});
const event = (channel, id, time, content = "<h1>shared</h1>") => ({
  id,
  kind: 40101,
  pubkey: "alice",
  created_at: time,
  content,
  tags: [
    ["h", channel],
    ["d", "page"],
  ],
});
test("production Page merges live edits over late history, isolates scope, sandboxes iframe and publishes edits", async () => {
  globalThis.pageReact = React;
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://buzz.example",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const receives = new Map();
  let resolveOld;
  let published;
  globalThis.pageRelay = {
    subscribeLive: async (f, cb) => {
      receives.set(f["#h"][0], cb);
      return () => {};
    },
    fetchEvents: async (f) =>
      f["#h"][0] === "a"
        ? await new Promise((r) => {
            resolveOld = r;
          })
        : [event("b", "b1", 1, "<h1>other</h1>")],
    publishEvent: async (e) => {
      published = e;
      receives.get("b")(
        event("b", "concurrent", e.created_at + 1, "<h1>Concurrent edit</h1>"),
      );
    },
  };
  const { ChannelPage } = await import("./ChannelPage.tsx");
  const root = createRoot(document.getElementById("root"));
  const render = async (channel) =>
    act(async () => {
      root.render(
        React.createElement(ChannelPage, { channelId: channel, canEdit: true }),
      );
      await new Promise((r) => setTimeout(r, 10));
    });
  await render("a");
  await act(async () => {
    receives.get("a")(event("a", "new", 2, "<h1>newest</h1>"));
    resolveOld([event("a", "old", 1)]);
  });
  let frame = document.querySelector("iframe");
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts");
  assert.match(frame.srcdoc, /newest/);
  assert.match(document.body.textContent, /Updated .* by Alice/);
  await render("b");
  await act(async () => receives.get("a")(event("a", "stale", 99, "LEAK")));
  frame = document.querySelector("iframe");
  assert.match(frame.srcdoc, /other/);
  assert.doesNotMatch(frame.srcdoc, /LEAK/);
  const click = async (text) =>
    act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === text)
        .click(),
    );
  await click("Edit HTML");
  await click("Save Page");
  assert.equal(published.kind, 40101);
  assert.deepEqual(published.tags, [
    ["h", "b"],
    ["d", "page"],
    ["m", "text/html"],
  ]);
  assert.equal(published.content, "<h1>other</h1>");
  assert.match(document.querySelector("iframe").srcdoc, /Concurrent edit/);
  // Script messages never open a browser automatically; unknown frames are ignored.
  await act(async () =>
    window.dispatchEvent(
      new dom.window.MessageEvent("message", {
        data: { type: "buzz-page-link", href: "https://example.com" },
        source: window,
      }),
    ),
  );
  assert.equal(globalThis.pageOpened, undefined);
  await act(async () => root.unmount());
  dom.window.close();
  delete globalThis.pageRelay;
});

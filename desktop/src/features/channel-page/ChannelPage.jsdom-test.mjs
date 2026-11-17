import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
      "@/shared/api/tauriChannels": "members",
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
        'export async function signRelayEvent(e){return {...e,id:(++globalThis.pageSequence).toString(16).padStart(64,"0"),pubkey:"alice",created_at:e.createdAt??100};}',
      members:
        "export async function getChannelMembers(){return globalThis.pageMembers}",
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
const chunkStore = new Map();
const publication = "00000000-0000-4000-8000-000000000000";
const event = (channel, id, created_at, html = "<h1>shared</h1>") => {
  const chunkId = createHash("sha256").update(`${channel}:${id}`).digest("hex");
  chunkStore.set(chunkId, {
    id: chunkId,
    kind: 40004,
    pubkey: "alice",
    tags: [
      ["h", channel],
      ["d", `buzz-page:chunk:${publication}:0`],
    ],
    content: JSON.stringify({
      type: "buzz.page.chunk",
      version: 1,
      page: "page",
      publication,
      index: 0,
      html,
    }),
  });
  return {
    id,
    kind: 40004,
    pubkey: "alice",
    created_at,
    tags: [
      ["h", channel],
      ["d", "buzz-page:page"],
      ["e", "b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1"],
      ["t", "buzz-page-v1"],
    ],
    content: JSON.stringify({
      type: "buzz.page",
      version: 1,
      page: "page",
      publication,
      chunks: [chunkId],
      bytes: new TextEncoder().encode(html).byteLength,
    }),
  };
};
test("production Page merges live edits over late history, isolates scope, sandboxes iframe and publishes edits", async () => {
  globalThis.pageReact = React;
  globalThis.pageSequence = 0;
  globalThis.pageMembers = [{ pubkey: "alice" }];
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
      f.ids
        ? f.ids.map((id) => chunkStore.get(id)).filter(Boolean)
        : f["#h"][0] === "a"
          ? await new Promise((r) => {
              resolveOld = r;
            })
          : [event("b", "b1", 1, "<h1>other</h1>")],
    publishEvent: async (e) => {
      chunkStore.set(e.id, e);
      if (JSON.parse(e.content).type !== "buzz.page") return;
      published = e;
      receives.get("b")(
        event("b", "concurrent", e.created_at + 1, "<h1>Concurrent edit</h1>"),
      );
    },
  };
  const { ChannelPage } = await import("./ChannelPage.tsx");
  const { ConversationViewGuards, ConversationViewGuardsContext } =
    await import("@/features/conversations/ConversationViewGuards");
  const { ConversationViewContext } = await import(
    "@/features/conversations/ConversationViewContext"
  );
  const guards = new ConversationViewGuards();
  const registerLeaveGuard = (guard) => guards.register("page-host", guard);
  const root = createRoot(document.getElementById("root"));
  const render = async (channel) =>
    act(async () => {
      root.render(
        React.createElement(
          ConversationViewGuardsContext.Provider,
          { value: guards },
          React.createElement(
            ConversationViewContext.Provider,
            {
              value: {
                viewInstanceId: "page-host",
                focused: true,
                visible: true,
              },
            },
            React.createElement(ChannelPage, {
              channelId: channel,
              canEdit: true,
              registerLeaveGuard,
            }),
          ),
        ),
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
  await act(async () =>
    receives.get("a")({
      ...event("a", "nonmember", 99, "UNAUTHORIZED"),
      pubkey: "mallory",
    }),
  );
  assert.doesNotMatch(document.querySelector("iframe").srcdoc, /UNAUTHORIZED/);
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
  assert.equal(guards.allow("page-host"), true);
  await click("Edit HTML");
  assert.equal(
    guards.allow("page-host"),
    true,
    "unchanged Page editor can leave without losing edits",
  );
  assert.equal(
    guards.allow("other-view"),
    true,
    "sibling views remain independent",
  );
  await click("Save Page");
  assert.equal(
    guards.allow("page-host"),
    true,
    "successful save releases Page guard",
  );
  assert.equal(published.kind, 40004);
  assert.deepEqual(published.tags, [
    ["h", "b"],
    ["d", "buzz-page:page"],
    ["e", "b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1"],
    ["t", "buzz-page-v1"],
  ]);
  assert.equal(
    JSON.parse(chunkStore.get(JSON.parse(published.content).chunks[0]).content)
      .html,
    "<h1>other</h1>",
  );
  assert.match(document.querySelector("iframe").srcdoc, /Concurrent edit/);
  const firstStamp = published.created_at;
  const realNow = Date.now;
  Date.now = () => firstStamp * 1000;
  await click("Edit HTML");
  await click("Save Page");
  assert.ok(
    published.created_at > firstStamp + 1,
    "second save advances beyond known live head even if history is stale",
  );
  Date.now = realNow;
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
  await click("Edit HTML");
  const { fireEvent } = await import("@testing-library/react");
  await act(async () =>
    fireEvent.change(document.querySelector("textarea"), {
      target: { value: "<h1>Unsaved typed draft</h1>" },
    }),
  );
  globalThis.pageMembers = [{ pubkey: "alice" }, { pubkey: "bob" }];
  await act(async () =>
    receives.get("b")(event("b", "roster-change", 888, "Changed shared head")),
  );
  assert.equal(
    document.querySelector("textarea").value,
    "<h1>Unsaved typed draft</h1>",
    "roster changes preserve the typed draft",
  );
  globalThis.pageMembers = [];
  await act(async () =>
    receives.get("b")(event("b", "removed", 999, "REMOVED AUTHOR")),
  );
  assert.equal(
    document.querySelector("iframe"),
    null,
    "roster refresh removes a former member's visible head",
  );
  assert.equal(
    document.querySelector("textarea").value,
    "<h1>Unsaved typed draft</h1>",
    "removed-author head is hidden without deleting the draft",
  );
  await act(async () => root.unmount());
  assert.equal(guards.allow("page-host"), true, "unmount releases Page guard");
  dom.window.close();
  delete globalThis.pageRelay;
});

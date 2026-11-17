import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
registerHooks({
  resolve(s, c, n) {
    if (s === "@/features/channels/ui/ChannelScreenLazyViews")
      return { shortCircuit: true, url: "forum-page:views" };
    if (s.endsWith("/RightAuxiliaryPane"))
      return { shortCircuit: true, url: "forum-page:right" };
    if (s === "./IdleAuxiliaryPanel")
      return { shortCircuit: true, url: "forum-page:idle" };
    return n(s, c);
  },
  load(u, c, n) {
    const sources = {
      "forum-page:views":
        'export function ForumView(){return globalThis.forumReact.createElement("p",null,"Retained forum posts")} export function UserProfilePanel(){return globalThis.forumReact.createElement("p",null,"Profile surface")}',
      "forum-page:right":
        "export function RightAuxiliaryPane({children}){return children}",
      "forum-page:idle":
        'export function IdleAuxiliaryPanel({children,onClose}){return globalThis.forumReact.createElement("aside",null,children,globalThis.forumReact.createElement("button",{onClick:onClose},"Close Page"))}',
    };
    return sources[u]
      ? { shortCircuit: true, format: "module", source: sources[u] }
      : n(u, c);
  },
});
test("forum Page occupies its auxiliary seam and restores existing content on close", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    forumReact: React,
  });
  const { ForumChannelContent } = await import(
    "../channels/ui/ForumChannelContent.tsx"
  );
  const root = createRoot(document.getElementById("root"));
  let closed = false;
  const props = {
    channel: { id: "forum", channelType: "forum" },
    header: "Header",
    profilePanelPubkey: "alice",
    pageSinglePanel: true,
    onClosePage: () => {
      closed = true;
    },
    pagePanel: React.createElement("p", null, "Shared forum Page"),
  };
  await act(async () =>
    root.render(React.createElement(ForumChannelContent, props)),
  );
  assert.match(
    document.querySelector("aside").textContent,
    /Shared forum Page/,
  );
  assert.equal(
    document.querySelector('[aria-label="Forum posts"]').className,
    "hidden",
  );
  assert.doesNotMatch(document.body.textContent, /Profile surface/);
  await act(async () => document.querySelector("button").click());
  assert.equal(closed, true);
  await act(async () =>
    root.render(
      React.createElement(ForumChannelContent, { ...props, pagePanel: null }),
    ),
  );
  assert.match(document.body.textContent, /Retained forum posts/);
  assert.match(document.body.textContent, /Profile surface/);
  await act(async () => root.unmount());
  dom.window.close();
});

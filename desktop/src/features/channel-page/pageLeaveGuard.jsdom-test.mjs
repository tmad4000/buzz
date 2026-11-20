import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
registerHooks({
  resolve(s, c, n) {
    const names = {
      "@/shared/api/relayClient": "relay",
      "@/shared/api/tauri": "sign",
      "@/shared/api/tauriChannels": "members",
      "@/features/profile/hooks": "profile",
      "@/shared/ui/button": "button",
      "@tauri-apps/plugin-opener": "opener",
    };
    return names[s]
      ? { shortCircuit: true, url: `page-leave:${names[s]}` }
      : n(s, c);
  },
  load(u, c, n) {
    const source = {
      "page-leave:relay":
        "const f=globalThis.leaveFixture;export const relayClient={subscribeLive:async()=>()=>{},fetchEvents:async q=>q.ids?f.events.filter(e=>q.ids.includes(e.id)):[],publishEvent:async e=>{f.events.push(e);await f.gate}}",
      "page-leave:sign":
        'const f=globalThis.leaveFixture;export async function signRelayEvent(e){return {...e,id:(++f.sequence).toString(16).padStart(64,"0"),pubkey:"alice",created_at:e.createdAt}}' +
        'export async function invokeTauri(command){f.unexpectedCalls.push("invokeTauri:"+command);throw new Error("Unexpected Page fixture IPC: "+command)}' +
        'export async function createAuthEvent(){f.unexpectedCalls.push("createAuthEvent");throw new Error("Unexpected Page fixture authentication")}' +
        'export async function getRelayWsUrl(){f.unexpectedCalls.push("getRelayWsUrl");throw new Error("Unexpected Page fixture relay lookup")}',
      "page-leave:members":
        'export async function getChannelMembers(){return [{pubkey:"alice"}]}',
      "page-leave:profile":
        "export function useUserProfileQuery(){return {data:null}}",
      "page-leave:button":
        'export function Button({children,size,variant,...props}){return globalThis.leaveReact.createElement("button",props,children)}',
      "page-leave:opener": "export async function openUrl(){}",
    }[u];
    return source ? { shortCircuit: true, format: "module", source } : n(u, c);
  },
});
test("background Page veto targets only its own view, protects saves, and unregisters cleanly", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://buzz.example",
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
    leaveReact: React,
    leaveFixture: {
      events: [],
      sequence: 0,
      gate: Promise.resolve(),
      unexpectedCalls: [],
    },
  });
  const { useChannelPageSurface } = await import("./useChannelPageSurface.tsx");
  const { ConversationViewContext } = await import(
    "../conversations/ConversationViewContext.tsx"
  );
  const { allowAppRestart } = await import("@/shared/lib/appRestartGuard");
  const guards = new Map(),
    surfaces = new Map();
  const register = (id) => (guard) => {
    guards.set(id, guard);
    return () => {
      if (guards.get(id) === guard) guards.delete(id);
    };
  };
  const registrations = { a: register("a"), b: register("b") };
  const channel = { id: "same-channel", isMember: true };
  const originalResult = {
    channelId: channel.id,
    messageId: "result-message",
    sectionId: "result-first",
    title: "First result",
  };
  let currentResult = originalResult;
  function View({ id }) {
    const surface = useChannelPageSurface(
      channel,
      React.createElement("span", null, `Pane controls ${id}`),
      registrations[id],
      (messageId) =>
        messageId === currentResult?.messageId ? currentResult : undefined,
    );
    surfaces.set(id, surface);
    return React.createElement(
      ConversationViewContext.Provider,
      { value: { viewInstanceId: id, focused: id === "b", visible: true } },
      React.createElement(
        "section",
        { "data-view": id },
        surface.pageHeaderActions,
        surface.pagePanel,
      ),
    );
  }
  const root = createRoot(document.getElementById("root"));
  const render = async (showA = true) =>
    act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          showA ? React.createElement(View, { id: "a", key: "a" }) : null,
          React.createElement(View, { id: "b", key: "b" }),
        ),
      );
    });
  await render();
  const scope = (id) => document.querySelector(`[data-view=${id}]`);
  const click = async (id, label) =>
    act(async () =>
      [...scope(id).querySelectorAll("button")]
        .find((b) => b.textContent === label)
        .click(),
    );
  await click("a", "Page");
  await click("b", "Page");
  await click("a", "Create Page");
  await click("b", "Create Page");
  assert.equal(guards.get("a")(), true, "unchanged editor can leave");
  const { fireEvent } = await import("@testing-library/react");
  await act(async () =>
    fireEvent.change(scope("a").querySelector("textarea"), {
      target: { value: "<h1>Draft A</h1>" },
    }),
  );
  const focusedEditor = scope("b").querySelector("textarea");
  focusedEditor.focus();
  assert.equal(document.activeElement, focusedEditor);
  await act(async () => assert.equal(guards.get("a")(), false));
  assert.equal(
    document.activeElement,
    focusedEditor,
    "background dirty veto preserves focused sibling editor",
  );
  assert.equal(
    guards.get("b")(),
    true,
    "focused B is not blocked by background A",
  );
  await act(async () =>
    assert.equal(
      allowAppRestart(),
      false,
      "background dirty Page blocks restart",
    ),
  );
  assert.match(scope("a").textContent, /Save or cancel/);
  assert.doesNotMatch(scope("b").textContent, /Save or cancel/);
  await act(async () => surfaces.get("a").closePage());
  assert.equal(scope("a").querySelector("textarea").value, "<h1>Draft A</h1>");
  await click("a", "Page");
  assert.ok(
    scope("a").querySelector("textarea"),
    "Page header cannot discard dirty editor",
  );
  await act(async () => surfaces.get("a").openPageSection(originalResult));
  assert.equal(surfaces.get("a").pageTitle, "Page");
  assert.equal(scope("a").querySelector("textarea").value, "<h1>Draft A</h1>");

  let release;
  globalThis.leaveFixture.gate = new Promise((resolve) => {
    release = resolve;
  });
  await click("a", "Save Page");
  focusedEditor.focus();
  await act(async () =>
    assert.equal(
      guards.get("a")(),
      false,
      "in-flight publication vetoes close",
    ),
  );
  assert.equal(
    document.activeElement,
    focusedEditor,
    "saving veto preserves sibling focus",
  );
  assert.equal(guards.get("b")(), true);
  await act(async () =>
    assert.equal(
      allowAppRestart(),
      false,
      "in-flight Page save blocks restart",
    ),
  );
  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.equal(
    guards.get("a")(),
    true,
    "acknowledged save releases target guard",
  );
  await click("a", "Edit HTML");
  await act(async () =>
    fireEvent.change(scope("a").querySelector("textarea"), {
      target: { value: "new unsaved edit" },
    }),
  );
  await act(async () => assert.equal(guards.get("a")(), false));
  await click("a", "Cancel");
  assert.equal(
    guards.get("a")(),
    true,
    "explicit cancel releases target guard",
  );
  await act(async () => surfaces.get("a").openPageSection(originalResult));
  assert.equal(surfaces.get("a").pageTitle, "First result");
  currentResult = { ...originalResult, title: "Refreshed title" };
  await render();
  assert.equal(surfaces.get("a").pageTitle, "Refreshed title");
  currentResult = { ...originalResult, sectionId: "result-replaced" };
  await render();
  assert.equal(surfaces.get("a").pageOpen, false);
  await act(async () => surfaces.get("a").openPageSection(originalResult));
  assert.equal(surfaces.get("a").pageOpen, false, "old pointer cannot reopen");
  await render(false);
  assert.equal(guards.has("a"), false);
  assert.equal(guards.get("b")(), true, "A cleanup preserves B registration");
  await act(async () => root.unmount());
  assert.equal(guards.size, 0);
  assert.equal(
    allowAppRestart(),
    true,
    "Page teardown releases restart guards",
  );
  assert.deepEqual(globalThis.leaveFixture.unexpectedCalls, []);
  dom.window.close();
});

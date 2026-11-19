import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

const calls = [];
globalThis.__quoteJump = (...args) => calls.push(args);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/shared/features")
      return { shortCircuit: true, url: "quote-test:features" };
    if (specifier === "@/app/navigation/useAppNavigation")
      return { shortCircuit: true, url: "quote-test:navigation" };
    if (
      specifier === "./MessageRow" &&
      context.parentURL?.endsWith("/MessageThreadRow.tsx")
    )
      return { shortCircuit: true, url: "quote-test:row" };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "quote-test:features")
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export const useFeatureEnabled=()=>globalThis.__quoteFeatureEnabled !== false;",
      };
    if (url === "quote-test:navigation")
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export const useAppNavigation=()=>({goChannel:globalThis.__quoteJump});",
      };
    if (url === "quote-test:row")
      return {
        shortCircuit: true,
        format: "module",
        source: `import React from ${JSON.stringify(new URL("../../../../node_modules/react/index.js", import.meta.url).href)}; export const MessageRow=({message})=>React.createElement('article',{'data-message-id':message.id},message.body);`,
      };
    return next(url, context);
  },
});
const { MessageThreadRow } = await import("./MessageThreadRow.tsx");
test("thread row keeps native quote jump, accessible first line and body identity across pending/ack and quote removal", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const root = createRoot(document.getElementById("root"));
  const message = {
    id: "local",
    body: "Child body",
    pending: true,
    tags: [
      ["h", "channel"],
      ["e", "root", "", "root"],
      ["e", "parent", "", "reply"],
    ],
  };
  const parents = new Map([
    ["parent", { id: "parent", tags: [["h","channel"]], body: "Parent <first> line\nSecond line" }],
  ]);
  const render = (value, map = parents, onJumpToThreadMessage) =>
    act(() =>
      root.render(
        React.createElement(MessageThreadRow, {
          channelId: "channel",
          message: value,
          parentMessages: map,
          onJumpToThreadMessage,
        }),
      ),
    );
  try {
    await render(message);
    const body = document.querySelector("article");
    const chip = document.querySelector("button");
    assert.equal(chip.textContent, "↪ re: Parent <first> line");
    assert.equal(
      chip.getAttribute("aria-label"),
      "Jump to parent: Parent <first> line",
    );
    assert.equal(chip.querySelector("first"), null);
    await act(() => chip.click());
    assert.deepEqual(calls, [
      ["channel", { messageId: "parent", threadRootId: "root", force: true }],
    ]);
    await render({ ...message, id: "accepted", pending: false });
    assert.equal(document.querySelector("article"), body);
    assert.equal(body.dataset.messageId, "accepted");
    // Repeated scoped route jumps are force-reveals, never toggle calls.
    await act(() => document.querySelector("button").click());
    assert.deepEqual(calls[1], ["channel", {messageId:"parent",threadRootId:"root",force:true}]);
    calls.pop();
    const ownerCalls = [];
    await render(
      { ...message, id: "accepted", pending: false },
      parents,
      (...args) => ownerCalls.push(args),
    );
    await act(() => document.querySelector("button").click());
    await act(() => document.querySelector("button").click());
    assert.deepEqual(ownerCalls, [["root", "parent"], ["root", "parent"]]);
    assert.equal(
      calls.length,
      1,
      "owning pane handles the jump without global navigation",
    );
    assert.equal(document.querySelector("article"), body);
    await render(message, parents, () => false);
    await act(() => document.querySelector("button").click());
    assert.equal(
      calls.length,
      1,
      "a refusing owner never falls through to route navigation",
    );
    await render(message, new Map());
    assert.equal(document.querySelector("button"), null);
    assert.equal(
      document.querySelector('[data-testid="thread-parent-stub"]').textContent,
      "reply to earlier message",
    );
    assert.equal(
      calls.length,
      1,
      "missing-parent stub never navigates or fetches",
    );
    await render({ ...message, tags: [] });
    assert.equal(document.querySelector("button"), null);
    assert.equal(document.querySelector("article"), body);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    delete globalThis.__quoteJump;
  }
});

test("quote presentation remains off when experiment is disabled", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    __quoteFeatureEnabled: false,
  });
  const root = createRoot(document.getElementById("root"));
  try {
    await act(() =>
      root.render(
        React.createElement(MessageThreadRow, {
          channelId: "channel",
          message: {
            id: "child",
            body: "Answer",
            tags: [
              ["h", "channel"],
              ["e", "root", "", "root"],
              ["e", "parent", "", "reply"],
            ],
          },
          parentMessages: new Map([
            ["parent", { id: "parent", tags: [["h","channel"]], body: "Question" }],
          ]),
        }),
      ),
    );
    assert.equal(
      document.querySelector('[data-testid="thread-parent-quote"]'),
      null,
    );
    assert.match(document.body.textContent, /Answer/);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    globalThis.__quoteFeatureEnabled = true;
  }
});

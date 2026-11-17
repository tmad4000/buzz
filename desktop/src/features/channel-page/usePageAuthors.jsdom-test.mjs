import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
registerHooks({
  resolve(s, c, n) {
    return s === "./service"
      ? { shortCircuit: true, url: "page-roster:service" }
      : n(s, c);
  },
  load(u, c, n) {
    return u === "page-roster:service"
      ? {
          shortCircuit: true,
          format: "module",
          source:
            "export function getPageAuthors(){return new Promise(resolve=>globalThis.rosterRequests.push(resolve))}",
        }
      : n(u, c);
  },
});
test("late roster response cannot restore an author removed by a newer response", async () => {
  const dom = new JSDOM('<div id="root"></div>');
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
    rosterRequests: [],
  });
  const { usePageAuthors } = await import("./usePageAuthors.ts");
  let state;
  function Harness() {
    state = usePageAuthors("private", 0);
    return React.createElement("p", null, JSON.stringify(state.authors));
  }
  const root = createRoot(document.getElementById("root"));
  await act(async () => root.render(React.createElement(Harness)));
  await act(async () => globalThis.rosterRequests[0](["alice"]));
  assert.deepEqual(state.authors, ["alice"]);
  let old, newer;
  await act(async () => {
    old = state.refresh();
    newer = state.refresh();
  });
  await act(async () => {
    globalThis.rosterRequests[2]([]);
    await newer;
  });
  await act(async () => {
    globalThis.rosterRequests[1](["alice"]);
    assert.deepEqual(await old, []);
  });
  assert.deepEqual(state.authors, []);
  await act(async () => root.unmount());
  dom.window.close();
});

import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import * as presentation from "./presentation.ts";
const require = createRequire(import.meta.url);
function load(url, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(url, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) => (s in mocks ? mocks[s] : require(s)),
    Date,
    setInterval,
    clearInterval,
  });
  return module.exports;
}
test("global presentation default-off mounts no clock; working pulse, attention, idle, stale and click use existing read-only callback", async (t) => {
  const now = 1795047000;
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: now * 1000 });
  const dom = new JSDOM('<div id="root"></div>');
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { useNow } = load(
    new URL("../../shared/lib/useNow.ts", import.meta.url),
    { "@/shared/lib/useDocumentVisible": { useDocumentVisible: () => true } },
  );
  let clockReads = 0,
    opened = 0;
  const { GlobalFleetIndicator } = load(
    new URL("./GlobalFleetIndicator.tsx", import.meta.url),
    {
      "@/shared/lib/useNow": {
        useNow: (n) => {
          clockReads++;
          return useNow(n);
        },
      },
      "./presentation": presentation,
    },
  );
  const root = createRoot(document.getElementById("root"));
  let enabled = false;
  let observation = {
    availability: "ok",
    verifiedAt: now,
    counts: { running: 4, idle: 2, blocked: 0, needsPermission: 0, unknown: 0 },
    root: {
      state: "running",
      stateVerifiedAt: now,
      queueDepth: 3,
      queueVerifiedAt: now,
    },
  };
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(GlobalFleetIndicator, {
          enabled,
          observation,
          onOpenQueue: () => opened++,
        }),
      ),
    );
  try {
    await render();
    assert.equal(clockReads, 0);
    assert.equal(document.body.textContent, "");
    enabled = true;
    await render();
    let dot = document.querySelector("[aria-hidden]");
    assert.match(dot.className, /bg-emerald-500/);
    assert.match(dot.className, /motion-safe:animate-pulse/);
    assert.match(
      document.body.textContent,
      /GCP: 4 agents working · root busy · 3 queued/,
    );
    assert.match(document.body.textContent, /M4\/M5 unknown/);
    await act(async () => document.querySelector("button").click());
    assert.equal(opened, 1);
    observation = {
      ...observation,
      counts: { ...observation.counts, needsPermission: 1 },
    };
    await render();
    dot = document.querySelector("[aria-hidden]");
    assert.match(dot.className, /bg-amber-500/);
    assert.doesNotMatch(dot.className, /animate-pulse/);
    observation = {
      ...observation,
      counts: { ...observation.counts, running: 0, needsPermission: 0 },
      root: { ...observation.root, state: "idle" },
    };
    await render();
    dot = document.querySelector("[aria-hidden]");
    assert.match(dot.className, /bg-muted-foreground/);
    assert.match(document.body.textContent, /root idle/);
    await act(async () => t.mock.timers.tick(120000));
    assert.match(document.body.textContent, /3 queued/);
    await act(async () => t.mock.timers.tick(1000));
    assert.match(document.body.textContent, /status stale/);
    assert.doesNotMatch(document.body.textContent, /3 queued|root idle/);
    enabled = false;
    await render();
    assert.equal(document.body.textContent, "");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    Object.assign(globalThis, previous);
    t.mock.timers.reset();
  }
});

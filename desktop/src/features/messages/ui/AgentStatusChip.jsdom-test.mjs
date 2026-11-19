import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
registerHooks({
  resolve(s, c, n) {
    if (s === "@tauri-apps/plugin-opener")
      return { shortCircuit: true, url: "status-test:opener" };
    return n(s, c);
  },
  load(u, c, n) {
    if (u === "status-test:opener")
      return {
        shortCircuit: true,
        format: "module",
        source:
          "export const openUrl=async(url)=>globalThis.__openedAgent.push(url);",
      };
    return n(u, c);
  },
});
const { AgentStatusChip } = await import("./AgentStatusChip.tsx");
const { parseBridgeStatusCard } = await import("../lib/bridgeStatusCard.ts");
test("compact card exposes exact agent link, signed original text, and in-place report edits", async () => {
  globalThis.__openedAgent = [];
  const href =
    "paseo://h/srv_KIFHQ_zsBnI2/agent/d809bb50-03b8-41d2-ba83-e2a18cb86a89";
  const originalBody = `⏳ Working — Astra · model unavailable (codex)\nAgent \`d809bb50-03b8-41d2-ba83-e2a18cb86a89\` · server \`srv_KIFHQ_zsBnI2\`\n[Open agent](${href})\nReported status · source: root`;
  const message = {
    kind: 9,
    parentId: "request",
    signerPubkey:
      "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb",
    body: originalBody,
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = async (body) =>
    act(() =>
      root.render(
        React.createElement(AgentStatusChip, {
          card: parseBridgeStatusCard({ ...message, body }),
          originalBody: body,
        }),
      ),
    );
  try {
    await render(originalBody);
    assert.match(
      container.querySelector("summary").textContent,
      /Reported working · Astra/,
    );
    assert.equal(container.querySelector("details").open, false);
    assert.equal(container.querySelector("pre").textContent, originalBody);
    const details = container.querySelector("details");
    const link = container.querySelector('[aria-label="Open agent Astra"]');
    assert.ok(
      details.contains(link),
      "link is opt-in with the collapsed details",
    );
    await act(() => {
      details.open = true;
    });
    await act(() => link.click());
    assert.deepEqual(globalThis.__openedAgent, [
      href.replace("paseo:", "paseo-fork:"),
    ]);
    const summary = container.querySelector("summary");
    await render(originalBody.replace("⏳ Working", "✅ Done"));
    assert.equal(container.querySelector("summary"), summary);
    assert.match(summary.textContent, /Reported done/);
  } finally {
    await act(() => root.unmount());
    container.remove();
    delete globalThis.__openedAgent;
  }
});

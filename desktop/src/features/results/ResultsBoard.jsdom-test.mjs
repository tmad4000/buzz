import assert from "node:assert/strict";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { ResultsBoard } from "./ResultsBoard.tsx";

test("expands one result at a time and replies or opens the selected card", async () => {
  const cards = [
    {
      sectionId: "result-brief",
      messageId: "first",
      title: "Brief",
      agent: "Agent",
      summary: "Findings",
      createdAt: 300,
    },
    {
      sectionId: "result-list",
      messageId: "second",
      title: "List",
      agent: "Agent",
      summary: "More findings",
      createdAt: 200,
    },
  ];
  const actions = [];
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const click = async (label) => {
    const button = [...container.querySelectorAll("button")].find(
      (button) =>
        (button.getAttribute("aria-label") ?? button.textContent) === label,
    );
    assert.ok(button, `Missing button ${label}`);
    await act(() => button.click());
  };
  try {
    await act(() =>
      root.render(
        createElement(ResultsBoard, {
          cards,
          loading: false,
          error: true,
          hasOlder: true,
          loadingOlder: false,
          onLoadOlder: () => actions.push("older"),
          onRetry: () => actions.push("retry"),
          onOpen: (card) => actions.push(`open:${card.messageId}`),
          onReply: (card) => actions.push(`reply:${card.messageId}`),
          renderPage: (card) =>
            createElement("p", { "data-page": card.sectionId }, card.title),
        }),
      ),
    );
    await click("Expand Brief");
    assert.deepEqual(
      [...container.querySelectorAll("[data-page]")].map(
        (node) => node.dataset.page,
      ),
      ["result-brief"],
    );
    await click("Expand List");
    assert.deepEqual(
      [...container.querySelectorAll("[data-page]")].map(
        (node) => node.dataset.page,
      ),
      ["result-list"],
    );
    await click("Open List");
    await click("Reply to Brief");
    await click("Load older messages");
    assert.deepEqual(actions, ["open:second", "reply:first", "older"]);
    assert.match(container.textContent, /Some results may be missing/);
    assert.doesNotMatch(container.textContent, /Needs you/);
    assert.equal(container.querySelectorAll("article").length, 2);
  } finally {
    await act(() => root.unmount());
    container.remove();
  }
});

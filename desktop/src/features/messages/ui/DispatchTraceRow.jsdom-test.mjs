import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import React from "react";

// Mount the real renderer and media components. Navigation is outside this test.
const navigationHook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@/app/navigation/useAppNavigation") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export const useAppNavigation = () => ({goChannel: () => {}, goAgents: () => {}});",
      };
    }
    return next(specifier, context);
  },
});
const { DispatchTraceRow } = await import("./DispatchTraceRow.tsx");
const { beginRelayOriginFetch } = await import(
  "../../../shared/lib/mediaUrl.ts"
);
navigationHook.deregister();

test("trace expansion preserves source attachments and signed previews without message actions", () => {
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  class Observer {
    observe() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = Observer;
  // Keep the real audio card before its viewport-triggered media fetch.
  globalThis.IntersectionObserver = Observer;
  const origin = "https://relay.example";
  beginRelayOriginFetch()(origin);
  const image = `${origin}/media/photo.png`;
  const video = `${origin}/media/demo.mp4`;
  const audio = `${origin}/media/note.ogg`;
  const file = `${origin}/media/report.pdf`;
  const snapshot = `${origin}/media/helper.agent.json`;
  const url = "https://linear.app/acme/issue/ABC-123/example";
  const message = {
    id: "source-event",
    time: "10:00",
    author: "Nora",
    body: [
      "Source message",
      `![Source image](${image})`,
      `![Source video](${video})`,
      `[Source audio](${audio})`,
      `[Source file](${file})`,
      `[Agent snapshot](${snapshot})`,
      `[Existing link](${url})`,
    ].join("\n\n"),
    tags: [
      ["imeta", `url ${image}`, "m image/png"],
      ["imeta", `url ${video}`, "m video/mp4"],
      ["imeta", `url ${audio}`, "m audio/ogg", "filename note.ogg"],
      ["imeta", `url ${file}`, "m application/pdf", "filename report.pdf"],
      [
        "imeta",
        `url ${snapshot}`,
        "m application/json",
        "filename helper.agent.json",
        `x ${"a".repeat(64)}`,
      ],
      [
        "link-preview",
        "snapshot",
        "1",
        url,
        "Signed preview title",
        "Linear",
        "Saved with source",
        "",
        "",
        "",
        "",
      ],
    ],
  };
  const opened = [];
  const root = { id: "thread-root", body: "Thread" };
  const view = render(
    React.createElement(DispatchTraceRow, {
      message,
      root,
      onOpen: (...args) => opened.push(args),
    }),
  );
  try {
    assert.equal(
      view.container.querySelector("[data-transcluded-source-id]"),
      null,
    );
    fireEvent.click(view.getByRole("button", { name: "Expand" }));
    const expanded = view.container.querySelector(
      "[data-transcluded-source-id]",
    );
    assert.equal(expanded?.dataset.transcludedSourceId, message.id);
    const media = within(expanded);
    assert.equal(
      media.getByRole("img", { name: "Source image" }).getAttribute("src"),
      image,
    );
    assert.equal(
      expanded.querySelector("video[controls]")?.getAttribute("src"),
      video,
    );
    const audioCard = media.getByTestId("audio-message-attachment");
    assert.ok(audioCard.querySelector("audio"));
    assert.ok(
      within(audioCard).getByRole("button", { name: "Play voice note" }),
    );
    assert.ok(
      within(audioCard).getByRole("button", { name: "Download note.ogg" }),
    );
    assert.ok(media.getByRole("button", { name: /report.pdf/ }));
    assert.ok(media.getByRole("button", { name: /helper.agent.json/ }));
    assert.ok(media.getByText("Signed preview title"));
    assert.equal(media.queryByRole("link", { name: "Existing link" }), null);
    assert.equal(
      media.queryByRole("button", {
        name: /import|reply|react|edit|remove.*preview|video review/i,
      }),
      null,
    );
    assert.equal(expanded.querySelector("[data-message-id]"), null);
    assert.deepEqual(opened, []);
    fireEvent.click(media.getByRole("button", { name: "Open thread" }));
    assert.deepEqual(opened, [[root, message.id]]);
    fireEvent.click(view.getByRole("button", { name: "Collapse" }));
    assert.equal(
      view.container.querySelector("audio,video,[data-transcluded-source-id]"),
      null,
    );
  } finally {
    cleanup();
    globalThis.ResizeObserver = originalResizeObserver;
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
});

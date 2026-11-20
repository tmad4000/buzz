import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { act, createElement as h } from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import { messageBodyPreferenceKey } from "../lib/messageBodyCollapse.ts";
import {
  MessageBodyDisclosure,
  useMessageBodyDisclosure,
} from "./MessageBodyDisclosure.tsx";

const viewer = "a1".repeat(32);
const otherViewer = "a2".repeat(32);
const messageId = "b2".repeat(32);
const communityId = "community-id";
const channelId = "channel-id";
const storageKey = messageBodyPreferenceKey(
  communityId,
  viewer,
  channelId,
  messageId,
);
const longBody = `Synthetic paragraph. ${"Repeat this Paseo reply line. ".repeat(40)}The original end.`;

function BodyFixture({ body, account = viewer, label = "fixture", children }) {
  const disclosure = useMessageBodyDisclosure({
    body,
    communityId,
    viewer: account,
    channelId,
    messageId,
  });
  return h(
    "section",
    { "aria-label": label },
    h("div", {}, "Replying to exact parent"),
    h(MessageBodyDisclosure, { disclosure }, children ?? h("p", {}, body)),
    h("div", {}, "Child reply remains"),
    disclosure.action &&
      h(
        "button",
        {
          type: "button",
          "aria-expanded": !disclosure.action.collapsed,
          "aria-controls": disclosure.action.bodyId,
          onClick: disclosure.action.toggle,
        },
        disclosure.action.collapsed ? "Expand message" : "Collapse message",
      ),
  );
}

function controlledBody(button) {
  return document.getElementById(button.getAttribute("aria-controls"));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test("long body defaults to a noninteractive preview with original content mounted and stable focus", () => {
  const { getByRole, getByText } = render(
    h(
      BodyFixture,
      { body: longBody },
      h("p", {}, longBody, h("a", { href: "#end" }, "Original link")),
    ),
  );
  const button = getByRole("button", { name: "Show more" });
  const body = controlledBody(button);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(body.hasAttribute("inert"), true);
  assert.equal(body.hidden, false);
  assert.ok(body.style.maxHeight);
  assert.ok(body.textContent.includes(longBody));
  assert.equal(window.localStorage.length, 0);
  assert.equal(getByText("Replying to exact parent").closest("[inert]"), null);
  assert.equal(getByText("Child reply remains").closest("[inert]"), null);

  button.focus();
  fireEvent.click(button);
  assert.equal(
    document.activeElement,
    getByRole("button", { name: "Show less" }),
  );
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(body.hasAttribute("inert"), false);
  assert.equal(body.style.maxHeight, "");
  assert.equal(
    getByRole("link", { name: "Original link" }).closest("[id]"),
    body,
  );
  assert.equal(window.localStorage.getItem(storageKey), "expanded");

  fireEvent.click(button);
  assert.equal(body.hasAttribute("inert"), true);
  assert.equal(window.localStorage.getItem(storageKey), "collapsed");
});

test("manual short collapse syncs both surfaces, survives remount, and stays per-account", () => {
  const body = "A short reply";
  const fixture = render(
    h(
      "main",
      {},
      h(BodyFixture, { body, label: "timeline" }),
      h(BodyFixture, { body, label: "thread" }),
    ),
  );
  const timeline = within(fixture.getByRole("region", { name: "timeline" }));
  const thread = within(fixture.getByRole("region", { name: "thread" }));
  const collapse = timeline.getByRole("button", { name: "Collapse message" });
  assert.notEqual(
    collapse.getAttribute("aria-controls"),
    thread
      .getByRole("button", { name: "Collapse message" })
      .getAttribute("aria-controls"),
  );
  assert.equal(timeline.queryByRole("button", { name: "Show more" }), null);
  fireEvent.click(collapse);

  for (const surface of [timeline, thread]) {
    const showMore = surface.getByRole("button", { name: "Show more" });
    assert.equal(controlledBody(showMore).hidden, true);
    assert.equal(controlledBody(showMore).textContent, body);
  }
  assert.equal(window.localStorage.length, 1);
  assert.equal(window.localStorage.getItem(storageKey), "collapsed");

  fixture.unmount();
  const reloaded = render(h(BodyFixture, { body }));
  assert.equal(
    controlledBody(reloaded.getByRole("button", { name: "Show more" })).hidden,
    true,
  );
  reloaded.rerender(h(BodyFixture, { body, account: otherViewer }));
  assert.equal(reloaded.queryByRole("button", { name: "Show more" }), null);
  assert.equal(
    controlledBody(reloaded.getByRole("button", { name: "Collapse message" }))
      .hidden,
    false,
  );
  reloaded.rerender(h(BodyFixture, { body }));
  fireEvent.click(reloaded.getByRole("button", { name: "Expand message" }));
  assert.equal(window.localStorage.getItem(storageKey), "expanded");
});

test("storage-denied preference is scoped to the current viewer", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage unavailable");
    },
  });
  try {
    const fixture = render(h(BodyFixture, { body: "Short body" }));
    fireEvent.click(fixture.getByRole("button", { name: "Collapse message" }));
    assert.ok(fixture.getByRole("button", { name: "Show more" }));
    fixture.rerender(
      h(BodyFixture, { body: "Short body", account: otherViewer }),
    );
    assert.equal(fixture.queryByRole("button", { name: "Show more" }), null);
  } finally {
    Object.defineProperty(window, "localStorage", original);
  }
});

test("a taller wrapped text body reclamps on resize, while a short link preview keeps its own UI", () => {
  let height = 120;
  let onResize = () => {};
  const oldObserver = globalThis.ResizeObserver;
  const oldRect = window.HTMLElement.prototype.getBoundingClientRect;
  const oldStyle = globalThis.getComputedStyle;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      onResize = callback;
    }
    observe() {}
    disconnect() {}
  };
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ height });
  globalThis.getComputedStyle = () => ({ lineHeight: "20px" });
  try {
    const fixture = render(
      h(BodyFixture, { body: "Wrap at the split-pane width" }),
    );
    assert.equal(fixture.queryByRole("button", { name: "Show more" }), null);
    height = 340;
    act(() => onResize());
    assert.equal(
      controlledBody(
        fixture.getByRole("button", { name: "Show more" }),
      ).style.maxHeight.includes("* 12"),
      true,
    );
    fixture.rerender(
      h(
        BodyFixture,
        { body: "A short message with a rich preview" },
        h("div", { "data-link-preview-list": "" }, "Preview details"),
      ),
    );
    assert.equal(fixture.queryByRole("button", { name: "Show more" }), null);
  } finally {
    globalThis.ResizeObserver = oldObserver;
    window.HTMLElement.prototype.getBoundingClientRect = oldRect;
    globalThis.getComputedStyle = oldStyle;
  }
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { act, createElement as h } from "react";
import { cleanup, fireEvent, render, within } from "@testing-library/react";

import {
  messageBodyPreferenceKey,
  resetMessageBodyMemoryPreferences,
} from "../lib/messageBodyCollapse.ts";
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
    viewer: account ?? undefined,
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
  resetMessageBodyMemoryPreferences();
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

function copies(account) {
  return h(
    "main",
    {},
    h(BodyFixture, { body: "Short body", account, label: "timeline" }),
    h(BodyFixture, { body: "Short body", account, label: "thread" }),
  );
}

function assertSharedMemoryPreference(fixture) {
  const timeline = within(fixture.getByRole("region", { name: "timeline" }));
  const thread = within(fixture.getByRole("region", { name: "thread" }));
  fireEvent.click(timeline.getByRole("button", { name: "Collapse message" }));
  assert.ok(thread.getByRole("button", { name: "Show more" }));
  fireEvent.click(thread.getByRole("button", { name: "Expand message" }));
  assert.ok(timeline.getByRole("button", { name: "Show less" }));
}

test("storage denial syncs both views and keeps the transient choice scoped across remounts", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage unavailable");
    },
  });
  try {
    const fixture = render(copies(viewer));
    assertSharedMemoryPreference(fixture);
    fireEvent.click(
      fixture.getAllByRole("button", { name: "Collapse message" })[0],
    );
    fixture.rerender(copies(otherViewer));
    assert.equal(fixture.queryByRole("button", { name: "Show more" }), null);
    fixture.unmount();
    const reloaded = render(copies(viewer));
    assert.equal(
      reloaded.getAllByRole("button", { name: "Show more" }).length,
      2,
    );
    act(() => resetMessageBodyMemoryPreferences());
    assert.equal(reloaded.queryByRole("button", { name: "Show more" }), null);
  } finally {
    Object.defineProperty(window, "localStorage", original);
  }
});

test("anonymous duplicate views sync for the session without writing a preference", () => {
  const fixture = render(copies(null));
  assertSharedMemoryPreference(fixture);
  assert.equal(window.localStorage.length, 0);
  fixture.rerender(copies(viewer));
  assert.equal(fixture.queryByRole("button", { name: "Show less" }), null);
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

test("wrapped text with an embed clamps while a tall preview alone does not", () => {
  const getRect = window.HTMLElement.prototype.getBoundingClientRect;
  const getRects = window.Range.prototype.getClientRects;
  const getStyle = globalThis.getComputedStyle;
  const wrapped = "Text near a tall preview in the thread. ".repeat(16).trim();
  const short = "One short line";
  // The embed itself deliberately has many text rectangles. Only the actual
  // message fragments should contribute, and same-line mark fragments count once.
  const preview = h(
    "div",
    { "data-link-preview-list": "" },
    "Tall card controls",
  );
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ height: 900 });
  globalThis.getComputedStyle = () => ({ lineHeight: "20px" });
  window.Range.prototype.getClientRects = function getSyntheticTextRects() {
    const value = this.startContainer.textContent;
    const lines = value === wrapped ? 13 : value === short ? 1 : 20;
    return Array.from({ length: lines }, (_, i) => {
      const top = i * 20;
      return { top, bottom: top + 20, height: 20, width: 40 };
    }).flatMap((rect) => [
      rect,
      { ...rect, top: rect.top + 2, bottom: rect.bottom + 2 },
    ]);
  };
  try {
    const fixture = render(
      h(BodyFixture, { body: wrapped }, h("p", {}, wrapped), preview),
    );
    assert.equal(
      fixture
        .getByRole("button", { name: "Show more" })
        .getAttribute("aria-expanded"),
      "false",
    );
    fixture.rerender(
      h(BodyFixture, { body: short }, h("p", {}, short), preview),
    );
    assert.equal(fixture.queryByRole("button", { name: "Show more" }), null);
  } finally {
    window.HTMLElement.prototype.getBoundingClientRect = getRect;
    globalThis.getComputedStyle = getStyle;
    window.Range.prototype.getClientRects = getRects;
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ConversationReadingPositionsProvider } from "@/features/conversations/ConversationReadingPositions";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { readingPositionKey } from "@/features/conversations/layout/readingPositions";
import {
  useThreadReadingScroll,
  useThreadReadingVisit,
} from "./useThreadReadingScroll.ts";
import { useThreadRowWindow } from "./useThreadRowWindow.ts";

async function fixture({
  explicit = null,
  focused = true,
  missingPrimary = false,
  measuredComposer = false,
} = {}) {
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancel = globalThis.cancelAnimationFrame;
  const previousObserver = globalThis.ResizeObserver;
  const previousFocus = document.hasFocus;
  const previousVisibility = Object.getOwnPropertyDescriptor(
    document,
    "visibilityState",
  );
  const frames = new Map();
  const retained = [];
  let sequence = 0;
  globalThis.requestAnimationFrame = (callback) => {
    retained.push(callback);
    frames.set(++sequence, callback);
    return sequence;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const observers = [];
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(element) {
      this.element = element;
    }
    disconnect() {
      this.element = null;
    }
  };
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const host = document.createElement("section");
  host.dataset.focusedConversation = focused ? "true" : "false";
  document.body.append(host);
  const root = createRoot(host);
  const viewport = { current: null };
  const composer = { current: null };
  const entries = Array.from({ length: 100 }, (_, index) => ({
    message: { id: `m${index}` },
  }));
  const slot = readingPositionKey("thread", "focus", "root");
  const initial = [
    {
      key: slot,
      position: missingPrimary
        ? { id: "deleted", neighbors: ["m80"], offset: -4, pixel: 40 }
        : { id: "m80", neighbors: ["m79"], offset: 0, pixel: 1600 },
    },
  ];
  let view = {
    viewInstanceId: "view-a",
    focused,
    visible: true,
    interactive: true,
    rootRef: { current: host },
  };
  let explicitKey = explicit;
  let scroll;
  const readers = new Map();
  let automaticWrites = 0;
  function Harness() {
    const reading = useThreadReadingVisit("root", true, true);
    const window = useThreadRowWindow(
      entries,
      "channel:root",
      true,
      false,
      undefined,
      null,
    );
    const deferred = React.useDeferredValue(window.entries);
    scroll = useThreadReadingScroll(
      {
        channelId: "root",
        scrollContainerRef: viewport,
        contentRef: viewport,
        isLoading: false,
        messages: deferred.map((e) => e.message),
      },
      {
        reading,
        projectedEntries: entries,
        ensureVisible: window.ensureVisible,
        explicitTargetKey: explicitKey,
        ready: true,
        composerRef: composer,
        paddingResetKey: false,
      },
    );
    const body = React.createElement(
      "div",
      {
        onScroll: scroll.onScroll,
        ref: (element) => {
          viewport.current = element;
          if (!element) return;
          Object.defineProperties(element, {
            scrollHeight: { configurable: true, value: 2000 },
            clientHeight: { configurable: true, value: 100 },
          });
          element.getBoundingClientRect = () => ({ top: 100, bottom: 200 });
          element.getClientRects = () => [{ width: 400, height: 100 }];
          element.scrollTo = (options) => {
            automaticWrites++;
            element.scrollTop = options.top;
          };
        },
      },
      deferred.map((entry) =>
        React.createElement("div", {
          key: entry.message.id,
          "data-message-id": entry.message.id,
          ref: (row) => {
            if (!row) return;
            const index = Number(entry.message.id.slice(1));
            row.getBoundingClientRect = () => ({
              top: 100 + index * 20 - viewport.current.scrollTop,
              bottom: 120 + index * 20 - viewport.current.scrollTop,
            });
          },
        }),
      ),
    );
    return React.createElement(
      React.Fragment,
      null,
      body,
      measuredComposer
        ? React.createElement("div", {
            ref: (element) => {
              composer.current = element;
              if (element)
                element.getBoundingClientRect = () => ({
                  height: 40,
                  top: 0,
                  bottom: 40,
                });
            },
          })
        : null,
    );
  }
  const render = async () =>
    act(() =>
      root.render(
        React.createElement(
          ConversationViewContext.Provider,
          { value: view },
          React.createElement(
            ConversationReadingPositionsProvider,
            {
              readingPositions: initial,
              registerReadingCapture: (key, capture) => {
                readers.set(key, capture);
                return () => readers.delete(key);
              },
              onReadingPosition: () => true,
            },
            React.createElement(Harness),
          ),
        ),
      ),
    );
  await render();
  return {
    viewport,
    readers,
    measureComposer: async (height) =>
      act(() => {
        for (const observer of observers)
          if (observer.element === composer.current && composer.current)
            observer.callback([
              {
                borderBoxSize: [{ blockSize: height }],
                contentRect: { height },
              },
            ]);
      }),
    slot,
    retained,
    writes: () => automaticWrites,
    flush: async (count = 12) => {
      for (let n = 0; n < count; n++)
        await act(async () => {
          const pending = [...frames.values()];
          frames.clear();
          for (const frame of pending) frame(n * 16);
          await Promise.resolve();
        });
    },
    target: async (value) => {
      explicitKey = value;
      await render();
    },
    focus: async (value) => {
      host.dataset.focusedConversation = value ? "true" : "false";
      view = { ...view, focused: value };
      await render();
    },
    close: async () => {
      await act(() => root.unmount());
      host.remove();
      globalThis.requestAnimationFrame = previousRaf;
      globalThis.cancelAnimationFrame = previousCancel;
      globalThis.ResizeObserver = previousObserver;
      document.hasFocus = previousFocus;
      if (previousVisibility)
        Object.defineProperty(document, "visibilityState", previousVisibility);
      else delete document.visibilityState;
    },
  };
}

test("saved thread anchor realizes a bounded deferred window before offset restore", async () => {
  const h = await fixture();
  try {
    assert.equal(
      h.writes(),
      0,
      "initial reservation prevents an opening/bottom pin",
    );
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 1600);
    assert.ok(h.viewport.current.querySelector('[data-message-id="m80"]'));
    assert.ok(
      h.viewport.current.querySelectorAll("[data-message-id]").length <= 40,
    );
    assert.ok(
      h.readers.get(h.slot)(),
      "capture unlocks only after restoration settles",
    );
    assert.equal(
      h.writes(),
      0,
      "automatic positioning does not compete with the restore",
    );
  } finally {
    await h.close();
  }
});

test("explicit local target consumes reservation and cannot replay the saved slot after clearing", async () => {
  const h = await fixture({ explicit: "search-hit" });
  try {
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 0);
    assert.ok(h.readers.get(h.slot)());
    await h.target(null);
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 0);
  } finally {
    await h.close();
  }
});

test("unfocused thread waits, and retired queued frames cannot replay after focus return", async () => {
  const h = await fixture({ focused: false });
  try {
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 0);
    await h.focus(true);
    const stale = [...h.retained];
    await h.focus(false);
    h.viewport.current.scrollTop = 700;
    await h.focus(true);
    await act(() => {
      for (const frame of stale) frame(0);
    });
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 700);
  } finally {
    await h.close();
  }
});

test("a missing primary anchor realizes its loaded neighbor beyond the first window", async () => {
  const h = await fixture({ missingPrimary: true });
  try {
    await h.flush();
    assert.ok(h.viewport.current.querySelector('[data-message-id="m80"]'));
    assert.equal(
      h.viewport.current.scrollTop,
      1604,
      "neighbor offset wins over stale pixel fallback40",
    );
    assert.ok(h.readers.get(h.slot)());
    assert.equal(h.writes(), 0);
  } finally {
    await h.close();
  }
});

test("attached composer measurements wait for restoration release without retiring capture", async () => {
  const h = await fixture({ measuredComposer: true });
  try {
    assert.equal(
      h.viewport.current.style.paddingBottom,
      "",
      "initial measurement must not mutate coverage mid-restore",
    );
    await h.measureComposer(60);
    await h.flush(1);
    await h.measureComposer(80);
    assert.equal(h.viewport.current.style.paddingBottom, "");
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 1600);
    assert.equal(
      h.viewport.current.style.paddingBottom,
      "80px",
      "latest measured size flushes after release",
    );
    assert.ok(
      h.readers.get(h.slot)(),
      "style observer must not strand capture after a settled restore",
    );
    assert.equal(h.writes(), 0);
  } finally {
    await h.close();
  }
});

test("retired padding flush cannot settle an unfocused view to bottom", async () => {
  const h = await fixture({ measuredComposer: true });
  try {
    await h.measureComposer(60);
    h.viewport.current.scrollTop = 1900;
    await h.focus(false);
    assert.equal(h.viewport.current.style.paddingBottom, "60px");
    assert.equal(
      h.writes(),
      0,
      "layout release must consume fallback without a background scroll",
    );
    await h.focus(true);
    await h.flush();
    assert.equal(h.viewport.current.scrollTop, 1900);
    assert.equal(h.writes(), 0);
  } finally {
    await h.close();
  }
});

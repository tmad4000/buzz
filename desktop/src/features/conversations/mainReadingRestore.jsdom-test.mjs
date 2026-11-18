import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ConversationReadingPositionsProvider,
  useCaptureConversationReadingPosition,
  useRestoreConversationReadingPosition,
} from "./ConversationReadingPositions.tsx";
import { ConversationViewContext } from "./ConversationViewContext.tsx";
import { readingPositionKey } from "./layout/readingPositions.ts";

async function fixture({
  covered = false,
  explicit = false,
  focused = true,
} = {}) {
  const host = document.createElement("div"),
    mount = document.createElement("div"),
    viewport = document.createElement("div");
  host.append(mount, viewport);
  document.body.append(host);
  host.dataset.focusedConversation = focused ? "true" : "false";
  if (covered) host.setAttribute("inert", "");
  viewport.getClientRects = () => [{ width: 400, height: 500 }];
  viewport.getBoundingClientRect = () => ({ top: 100 });
  const row = document.createElement("div");
  row.dataset.messageId = "m-20";
  row.getBoundingClientRect = () => ({ top: 98, bottom: 130 });
  viewport.append(row);
  const container = { current: viewport };
  const focus = document.hasFocus,
    visibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  let key = readingPositionKey("main", "threads");
  let explicitTarget = explicit;
  const initial = ["threads", "timeline"].map((mode) => ({
    key: readingPositionKey("main", mode),
    position: { id: `saved-${mode}`, offset: -2, pixel: 500, neighbors: [] },
  }));
  let view = {
    viewInstanceId: "a",
    focused,
    visible: true,
    interactive: true,
    rootRef: { current: host },
  };
  const readers = new Map(),
    calls = [];
  let stops = 0;
  function Harness() {
    useCaptureConversationReadingPosition({
      key,
      container,
      ids: ["m-20"],
      ready: true,
    });
    useRestoreConversationReadingPosition({
      key,
      container,
      ready: true,
      explicitTarget,
      restore: (position, onStop) => {
        calls.push({ position, onStop });
        return () => {
          stops++;
        };
      },
    });
    return null;
  }
  const root = createRoot(mount);
  const render = () =>
    act(() =>
      root.render(
        React.createElement(
          ConversationViewContext.Provider,
          { value: view },
          React.createElement(
            ConversationReadingPositionsProvider,
            {
              readingPositions: initial,
              onReadingPosition: () => true,
              registerReadingCapture: (slot, capture) => {
                readers.set(slot, capture);
                return () => readers.delete(slot);
              },
            },
            React.createElement(Harness),
          ),
        ),
      ),
    );
  await render();
  return {
    host,
    viewport,
    calls,
    readers,
    key: () => key,
    stops: () => stops,
    mode: async (mode) => {
      key = readingPositionKey("main", mode);
      await render();
    },
    explicit: async (next) => {
      explicitTarget = next;
      await render();
    },
    focus: async () => {
      host.dataset.focusedConversation = "true";
      view = { ...view, focused: true };
      await render();
    },
    close: async () => {
      await act(() => root.unmount());
      assert.equal(readers.size, 0);
      document.hasFocus = focus;
      if (visibility)
        Object.defineProperty(document, "visibilityState", visibility);
      else delete document.visibilityState;
      host.remove();
    },
  };
}
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setImmediate(resolve));
  });

test("mode visits restore their own saved slot and capture stays blocked until settlement", async () => {
  const h = await fixture();
  try {
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].position.id, "saved-threads");
    assert.equal(h.readers.get(h.key())(), null);
    h.calls[0].onStop("complete");
    assert.equal(h.readers.get(h.key())().id, "m-20");
    await h.mode("timeline");
    assert.equal(h.calls[1].position.id, "saved-timeline");
    await h.mode("threads");
    assert.equal(h.calls[2].position.id, "saved-threads");
  } finally {
    await h.close();
  }
});

test("uncover rechecks initial eligibility without prop changes but a retired attempt never resumes", async () => {
  const h = await fixture({ covered: true });
  try {
    assert.equal(h.calls.length, 0);
    await act(async () => {
      h.host.removeAttribute("inert");
      await Promise.resolve();
    });
    await flush();
    assert.equal(h.calls.length, 1);
    const stale = h.calls[0].onStop;
    await act(async () => {
      h.host.setAttribute("inert", "");
      h.host.removeAttribute("inert");
      await Promise.resolve();
    });
    await flush();
    assert.equal(h.stops(), 1);
    assert.equal(h.calls.length, 1);
    stale("complete");
    assert.equal(
      h.readers.get(h.key())(),
      null,
      "retired completion cannot release capture protection",
    );
    await act(() => {
      window.dispatchEvent(new Event("blur"));
      window.dispatchEvent(new Event("focus"));
    });
    await flush();
    assert.equal(h.calls.length, 1);
  } finally {
    await h.close();
  }
});

test("explicit route targets suppress saved restoration even after the target clears", async () => {
  const h = await fixture({ explicit: true });
  try {
    assert.equal(h.calls.length, 0);
    assert.ok(h.readers.get(h.key())());
    await h.explicit(false);
    assert.equal(h.calls.length, 0);
    await h.mode("timeline");
    assert.equal(h.calls.length, 1);
  } finally {
    await h.close();
  }
});

test("a reading gesture before first focus consumes the old restore opportunity", async () => {
  const h = await fixture({ focused: false });
  try {
    assert.equal(h.calls.length, 0);
    h.viewport.dispatchEvent(new Event("wheel"));
    await h.focus();
    assert.equal(
      h.calls.length,
      0,
      "focus must not overwrite a reader's newer position",
    );
    assert.ok(h.readers.get(h.key())());
  } finally {
    await h.close();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ConversationReadingPositionsProvider,
  useCaptureConversationReadingPosition,
} from "./ConversationReadingPositions.tsx";
import { readingPositionKey } from "./layout/readingPositions.ts";

test("actual capture hook preserves saved slots until interaction, bounds snapshots and retires DOM callbacks", async () => {
  const host = document.createElement("div"),
    mount = document.createElement("div"),
    viewport = document.createElement("div");
  host.append(mount, viewport);
  document.body.append(host);
  const row = document.createElement("div");
  row.dataset.messageId = "m-20";
  viewport.append(row);
  viewport.getClientRects = () => [{ width: 400, height: 500 }];
  viewport.getBoundingClientRect = () => ({ top: 100 });
  row.getBoundingClientRect = () => ({ top: 94, bottom: 120 });
  viewport.scrollTop = 200;
  const container = { current: viewport };
  const key = readingPositionKey("main", "threads");
  const saved = [
    {
      key,
      position: { id: "saved-row", offset: 10, pixel: 20, neighbors: [] },
    },
  ];
  const registrations = new Map(),
    writes = [];
  const root = createRoot(mount);
  function Capture() {
    useCaptureConversationReadingPosition({
      key,
      container,
      ready: true,
      ids: Array.from({ length: 100 }, (_, i) => `m-${i}`),
    });
    return null;
  }
  let unmounted = false;
  try {
    await act(() =>
      root.render(
        React.createElement(
          ConversationReadingPositionsProvider,
          {
            readingPositions: saved,
            onReadingPosition: (slot, position) => {
              writes.push({ slot, position });
              return true;
            },
            registerReadingCapture: (slot, capture) => {
              registrations.set(slot, capture);
              return () => registrations.delete(slot);
            },
          },
          React.createElement(Capture),
        ),
      ),
    );
    const retained = registrations.get(key),
      focused = document.activeElement;
    assert.equal(retained(), null);
    viewport.dispatchEvent(new Event("scrollend"));
    assert.equal(writes.length, 0);
    viewport.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    viewport.dispatchEvent(new Event("scrollend"));
    assert.equal(writes.length, 1);
    assert.equal(writes[0].position.id, "m-20");
    assert.equal(writes[0].position.neighbors.length, 8);
    assert.equal(document.activeElement, focused);
    assert.equal(viewport.scrollTop, 200);
    host.setAttribute("inert", "");
    assert.equal(retained(), null);
    host.removeAttribute("inert");
    await act(() => root.unmount());
    unmounted = true;
    assert.equal(registrations.size, 0);
    assert.equal(retained(), null);
    viewport.dispatchEvent(new Event("scrollend"));
    assert.equal(writes.length, 1);
    assert.equal(saved[0].position.id, "saved-row");
  } finally {
    if (!unmounted) await act(() => root.unmount());
    host.remove();
  }
});

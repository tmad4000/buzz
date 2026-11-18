import assert from "node:assert/strict";
import test from "node:test";
import { captureViewportReadingPosition } from "./viewportReadingCapture.ts";

function viewport() {
  const rows = [
    {
      dataset: { messageId: "old" },
      getBoundingClientRect: () => ({ top: 0, bottom: 90 }),
    },
    {
      dataset: { messageId: "m-20" },
      getBoundingClientRect: () => ({ top: 94, bottom: 130 }),
    },
  ];
  const pixel = 400;
  const element = {
    isConnected: true,
    closest: () => null,
    getClientRects: () => [{ width: 400, height: 500 }],
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => rows,
    get scrollTop() {
      return pixel;
    },
    set scrollTop(_) {
      assert.fail("capture must not scroll");
    },
    focus: () => assert.fail("capture must not focus"),
    dispatchEvent: () =>
      assert.fail("capture must not synthesize reading/scroll events"),
  };
  return element;
}
test("capture retains the visible row and offset with at most eight canonical neighbors", () => {
  const element = viewport();
  const ids = Array.from({ length: 1000 }, (_, i) => `m-${i}`);
  const captured = captureViewportReadingPosition(element, ids);
  assert.equal(captured.id, "m-20");
  assert.equal(captured.offset, -6);
  assert.equal(captured.pixel, 400);
  assert.equal(captured.neighbors.length, 8);
  assert.deepEqual(captured.neighbors.slice(0, 4), [
    "m-21",
    "m-19",
    "m-22",
    "m-18",
  ]);
  assert.equal(ids.length, 1000);
});
test("hidden, covered and detached viewports never replace an existing saved position", () => {
  for (const patch of [
    { isConnected: false },
    { closest: () => ({ inert: true }) },
    { getClientRects: () => [] },
  ])
    assert.equal(
      captureViewportReadingPosition(Object.assign(viewport(), patch), [
        "m-20",
      ]),
      null,
    );
});
test("an empty committed viewport records bounded pixel fallback without inventing a message", () => {
  const element = viewport();
  element.querySelectorAll = () => [];
  assert.deepEqual(captureViewportReadingPosition(element, []), {
    id: null,
    offset: 0,
    pixel: 400,
    neighbors: [],
  });
});

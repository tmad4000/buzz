import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateExtents,
  projectLayoutRegions,
  resizeAtBoundary,
} from "./regions.ts";
import {
  createSingleLayout,
  createConversationView,
  splitPane,
} from "./model.ts";

test("projection clamps to minima without changing persisted desktop ratio and fills exact content bounds", () => {
  let n = 0;
  const ids = (kind) => `${kind}-${++n}`;
  const one = createSingleLayout(createConversationView("same", ids), ids);
  const two = splitPane(
    one,
    one.root.id,
    createConversationView("same", ids),
    "horizontal",
    ids,
  );
  two.root.sizes = [0.1, 0.9];
  const regions = projectLayoutRegions(two.root, {
    left: 0,
    top: 0,
    width: 1008,
    height: 500,
  });
  assert.equal(regions.panes[0].rect.width, 360);
  assert.ok(Math.abs(regions.panes[1].rect.width - 640) < 1e-9);
  assert.equal(regions.panes[1].rect.left, 368);
  assert.deepEqual(two.root.sizes, [0.1, 0.9]);
  assert.deepEqual(resizeAtBoundary(regions.dividers[0], 0.99), [0.64, 0.36]);
  assert.equal(
    projectLayoutRegions(two.root, {
      left: 0,
      top: 0,
      width: 727,
      height: 500,
    }),
    null,
  );
});

test("multi-child allocation freezes minima, preserves free-side weights and rejects impossible sizes", () => {
  assert.deepEqual(
    allocateExtents(1000, [1, 1, 8], [300, 300, 300]),
    [300, 300, 400],
  );
  assert.equal(allocateExtents(899, [1, 1, 8], [300, 300, 300]), null);
  assert.deepEqual(
    allocateExtents(900, [1, 1, 8], [300, 300, 300]),
    [300, 300, 300],
  );
});

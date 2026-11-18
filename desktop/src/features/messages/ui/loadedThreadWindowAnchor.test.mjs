import assert from "node:assert/strict";
import test from "node:test";
import { loadedThreadWindowAnchor } from "./loadedThreadWindowAnchor.ts";

test("saved anchor precedes neighbors and window stays within loaded bounds", () => {
  const index = new Map([
    ["first", 0],
    ["middle", 5000],
    ["last", 9999],
  ]);
  assert.deepEqual(
    loadedThreadWindowAnchor(index, 10000, ["middle", "first"]),
    { index: 5000, start: 4992 },
  );
  assert.deepEqual(
    loadedThreadWindowAnchor(index, 10000, ["missing", "last"]),
    { index: 9999, start: 9960 },
  );
  assert.deepEqual(loadedThreadWindowAnchor(index, 1, ["first"]), {
    index: 0,
    start: 0,
  });
});
test("missing or collapsed anchors do not expand or search beyond eight neighbors", () => {
  const index = new Map([["loaded", 10]]);
  assert.equal(
    loadedThreadWindowAnchor(
      index,
      40,
      Array(9).fill("missing").concat("loaded"),
    ),
    null,
  );
  assert.equal(loadedThreadWindowAnchor(index, 0, ["loaded"]), null);
  assert.equal(loadedThreadWindowAnchor(index, 40, ["collapsed"]), null);
});

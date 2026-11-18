import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filterOpenThreadPins,
  parseOpenThreadPins,
  openThreadPinsKey,
} from "./openThreadPins.ts";
test("pin preferences isolate identity, community and chat", () => {
  const keys = [
    ["a", "b", "c"],
    ["a", "x", "c"],
    ["x", "b", "c"],
    ["a", "b", "x"],
    ["a:b", "b", "c"],
  ].map((args) => openThreadPinsKey(...args));
  assert.equal(new Set(keys).size, keys.length);
});
test("manual references are bounded, validated, deduplicated; no lifecycle fields", () => {
  assert.deepEqual(parseOpenThreadPins("oops"), []);
  assert.deepEqual(parseOpenThreadPins('{"id":"x"}'), []);
  assert.deepEqual(
    parseOpenThreadPins(
      JSON.stringify([
        null,
        { id: 5, title: "bad" },
        { id: "x", title: "first" },
        { id: "x", title: "last", state: "done" },
      ]),
    ),
    [{ id: "x", title: "last" }],
  );
  assert.equal(
    parseOpenThreadPins(
      JSON.stringify(
        Array.from({ length: 200 }, (_, i) => ({ id: String(i), title: "x" })),
      ),
    ).length,
    100,
  );
});
test("search does not change membership or pin order", () => {
  const pins = [
    { id: "1", title: "Chris sync" },
    { id: "2", title: "Release" },
  ];
  assert.deepEqual(filterOpenThreadPins(pins, " CHRIS "), [pins[0]]);
  assert.deepEqual(filterOpenThreadPins(pins, ""), pins);
  assert.equal(pins.length, 2);
});
test("undo removal preserves later pins and does not duplicate or evict", async () => {
  const { restoreOpenThreadPin } = await import("./openThreadPins.ts");
  const a = { id: "a", title: "A" },
    b = { id: "b", title: "B" },
    c = { id: "c", title: "C" };
  assert.deepEqual(restoreOpenThreadPin([a, c], b, 1), [a, b, c]);
  assert.deepEqual(restoreOpenThreadPin([a, b], b, 1), [a, b]);
  assert.equal(
    restoreOpenThreadPin(
      Array.from({ length: 100 }, (_, i) => ({ id: String(i), title: "X" })),
      b,
      1,
    ).length,
    100,
  );
});

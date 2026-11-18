import assert from "node:assert/strict";
import test from "node:test";
import { mainReadingIntent } from "./mainReadingIntent.ts";

test("search and routed targets both supersede saved positions", () => {
  assert.equal(mainReadingIntent(null, null).explicit, false);
  assert.equal(mainReadingIntent("route", null).explicit, true);
  assert.equal(mainReadingIntent(null, "search").explicit, true);
  assert.equal(mainReadingIntent("route", "search").explicit, true);
});
test("target identity distinguishes search activations even when the routed target is unchanged", () => {
  const before = mainReadingIntent("route", "first").key;
  assert.notEqual(mainReadingIntent("route", "second").key, before);
  assert.notEqual(mainReadingIntent(null, "first").key, before);
  assert.notEqual(mainReadingIntent("route", null).key, before);
  assert.equal(
    mainReadingIntent("", undefined).key,
    mainReadingIntent(null, null).key,
  );
});

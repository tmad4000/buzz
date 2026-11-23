import assert from "node:assert/strict";
import test from "node:test";

import { advertisesSearchSort } from "../relaySearchSort.ts";
import {
  messageSectionTitle,
  parseSearchSort,
  readSearchSort,
  SEARCH_SORT_STORAGE_KEY,
  writeSearchSort,
} from "./searchSort.ts";

test("unknown or missing stored sorts fall back to relevance", () => {
  assert.equal(parseSearchSort(null), "relevance");
  assert.equal(parseSearchSort("random"), "relevance");
  assert.equal(parseSearchSort("oldest"), "oldest");
});

test("the chosen sort is remembered, and blocked storage is not fatal", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const define = (value) =>
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value,
    });
  try {
    const stored = new Map();
    define({
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
    });
    writeSearchSort("newest");
    assert.equal(stored.get(SEARCH_SORT_STORAGE_KEY), "newest");
    assert.equal(readSearchSort(), "newest");

    define({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    writeSearchSort("oldest");
    assert.equal(readSearchSort(), "relevance");
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});

test("headings only claim a date order that was proven", () => {
  assert.equal(messageSectionTitle("relevance", true), "Most relevant");
  assert.equal(messageSectionTitle("newest", true), "Newest first");
  assert.equal(
    messageSectionTitle("newest", false),
    "Newest of the top matches",
  );
  assert.equal(
    messageSectionTitle("oldest", false),
    "Oldest of the top matches",
  );
});

test("relay sorting is used only when NIP-11 advertises it", () => {
  assert.equal(
    advertisesSearchSort({ supported_extensions: ["buzz-search-sort"] }),
    true,
  );
  assert.equal(advertisesSearchSort({ supported_extensions: [] }), false);
  assert.equal(
    advertisesSearchSort({ supported_extensions: "buzz-search-sort" }),
    false,
  );
  assert.equal(advertisesSearchSort(null), false);
});

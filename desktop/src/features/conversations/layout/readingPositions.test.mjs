import assert from "node:assert/strict";
import test from "node:test";
import {
  readingPositionKey,
  updateReadingPosition,
  readPosition,
  copyReadingPositions,
  isViewReadingPositions,
  MAX_READING_POSITIONS,
} from "./readingPositions.ts";

const position = (id) => ({
  id,
  offset: -12.5,
  pixel: 840,
  neighbors: ["before", "after"],
});
test("main modes and thread target/modes keep distinct immutable snapshots", () => {
  const keys = [
    readingPositionKey("main", "threads"),
    readingPositionKey("main", "timeline"),
    readingPositionKey("thread", "focus", "root-a"),
    readingPositionKey("thread", "split", "root-a"),
    readingPositionKey("thread", "focus", "root-b"),
  ];
  let value;
  for (const [i, key] of keys.entries())
    value = updateReadingPosition(value, key, position(`message-${i}`));
  assert.equal(value.length, 5);
  for (const [i, key] of keys.entries())
    assert.equal(readPosition(value, key).id, `message-${i}`);
  const captured = position("changed");
  const next = updateReadingPosition(value, keys[0], captured);
  captured.neighbors.push("later");
  assert.equal(readPosition(value, keys[0]).id, "message-0");
  assert.deepEqual(readPosition(next, keys[0]).neighbors, ["before", "after"]);
  assert.equal(readPosition(next, keys[1]).id, "message-1");
});
test("reads, duplicates and serialization do not share nested mutable arrays", () => {
  const key = readingPositionKey("main", "threads");
  const value = updateReadingPosition(undefined, key, position("a"));
  const read = readPosition(value, key),
    duplicate = copyReadingPositions(value);
  read.neighbors.push("read-mutation");
  duplicate[0].position.neighbors.push("duplicate-mutation");
  assert.deepEqual(value[0].position.neighbors, ["before", "after"]);
  const roundTrip = JSON.parse(JSON.stringify(value));
  assert.equal(isViewReadingPositions(roundTrip), true);
  assert.deepEqual(roundTrip, value);
  assert.equal(
    updateReadingPosition(value, key, position("a")),
    value,
    "unchanged capture must not force controller writes",
  );
});
test("bounded recency evicts only the oldest context and never mutates the input", () => {
  let value;
  const first = readingPositionKey("thread", "split", "root-0");
  for (let i = 0; i < MAX_READING_POSITIONS; i++)
    value = updateReadingPosition(
      value,
      readingPositionKey("thread", "split", `root-${i}`),
      position(`message-${i}`),
    );
  const next = updateReadingPosition(
    value,
    readingPositionKey("main", "timeline"),
    position("latest"),
  );
  assert.equal(next.length, MAX_READING_POSITIONS);
  assert.equal(readPosition(next, first), undefined);
  assert.equal(readPosition(value, first).id, "message-0");
});
test("malformed, oversized, duplicate and nonfinite reading records fail closed", () => {
  const key = readingPositionKey("main", "threads");
  for (const p of [
    { ...position("a"), offset: Infinity },
    { ...position("a"), pixel: -1 },
    { ...position("a"), neighbors: ["same", "same"] },
    {
      ...position("a"),
      neighbors: Array.from({ length: 9 }, (_, i) => String(i)),
    },
    { ...position("a"), id: "x".repeat(257) },
    { ...position("a"), unexpected: true },
  ]) {
    assert.equal(updateReadingPosition(undefined, key, p), null);
  }
  const entry = { key, position: position("a") };
  assert.equal(isViewReadingPositions([entry, entry]), false);
  assert.equal(updateReadingPosition(undefined, "main", position("a")), null);
  assert.throws(() => readingPositionKey("thread", "focus", ""));
  const huge = Array.from({ length: 8 }, (_, i) => ({
    key: readingPositionKey("thread", "split", `root-${i}`),
    position: {
      ...position("a"),
      neighbors: Array.from({ length: 8 }, (_, n) => `${n}${"😀".repeat(127)}`),
    },
  }));
  assert.equal(
    isViewReadingPositions(huge),
    false,
    "UTF-8 byte bound applies independently of character bounds",
  );
});

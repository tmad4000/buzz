import { test } from "node:test";
import assert from "node:assert/strict";
import { relativeUpdated } from "./appBuild.ts";
test("relative timestamp boundaries and missing time", () => {
  const now = Date.UTC(2026, 10, 16, 12);
  for (const [seconds, expected] of [
    [0, "just now"],
    [59, "just now"],
    [60, "1m ago"],
    [3599, "59m ago"],
    [3600, "1h ago"],
    [86400, "1d ago"],
    [604799, "6d ago"],
  ])
    assert.equal(
      relativeUpdated(new Date(now - seconds * 1000).toISOString(), now),
      expected,
    );
  assert.equal(relativeUpdated("", now), "");
  assert.equal(relativeUpdated("bad", now), "");
  assert.match(relativeUpdated("2026-11-01T12:00:00Z", now), /Nov/);
  assert.match(relativeUpdated("2025-11-01T12:00:00Z", now), /2025/);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeThreadRows,
  parseActiveThreadPreferences,
} from "./activeThreadsPhase0.ts";
const now = new Date(2026, 10, 20, 12).getTime();
const seconds = (day) => new Date(2026, 10, day, 12).getTime() / 1000;
const entry = (id, count, extra = {}) => ({
  message: { id, body: id, createdAt: seconds(10), ...extra },
  summary: { replyCount: count, lastReplyAt: seconds(20) },
});
const prefs = { enabled: true, threshold: 10 };
test("Phase0 defaults on at ten total messages, preserves explicit opt-out and valid prior threshold", () => {
  for (const raw of [
    null,
    "broken",
    "null",
    '{"enabled":"false","threshold":"10"}',
  ])
    assert.deepEqual(parseActiveThreadPreferences(raw), prefs);
  assert.deepEqual(
    parseActiveThreadPreferences('{"enabled":false,"threshold":20}'),
    { enabled: false, threshold: 20 },
  );
  assert.equal(
    activeThreadRows(
      [entry("eight-replies", 8), entry("nine-replies", 9)],
      [],
      new Set(),
      prefs,
      now,
    )[0].id,
    "nine-replies",
  );
});
test("canonical automatic projection deduplicates, excludes pending/descendants/dismissed and never mutates manual membership", () => {
  const pins = [{ id: "manual", title: "Manual" }];
  const rows = activeThreadRows(
    [
      entry("auto", 9),
      entry("auto", 10),
      entry("dismissed", 99),
      entry("pending", 99, { pending: true }),
      entry("outbox-local:x", 99),
      entry("optimistic-x", 99),
      entry("child", 99, { parentId: "auto" }),
    ],
    pins,
    new Set(["dismissed"]),
    prefs,
    now,
  );
  assert.deepEqual(
    rows.map(({ id }) => id),
    ["auto", "manual"],
  );
  assert.equal(rows[0].automatic, true);
  assert.equal(rows[1].band, "Outside loaded history");
  assert.deepEqual(pins, [{ id: "manual", title: "Manual" }]);
  assert.equal(
    activeThreadRows(
      [entry("auto", 20)],
      pins,
      new Set(),
      { ...prefs, enabled: false },
      now,
    ).length,
    1,
  );
});
test("existing descendant summaries include nested activity, band by local calendar and retain offline manual references honestly", () => {
  const roots = ["today", "recent", "old"].map((id) => ({
    message: { id, body: id, createdAt: seconds(10) },
    summary: null,
  }));
  const summaries = new Map([
    ["today", { descendantCount: 9, lastReplyAt: seconds(20) }],
    ["recent", { descendantCount: 10, lastReplyAt: seconds(18) }],
    ["old", { descendantCount: 11, lastReplyAt: seconds(17) }],
    ["unloaded", { descendantCount: 100, lastReplyAt: seconds(20) }],
  ]);
  const rows = activeThreadRows(
    roots,
    [{ id: "unloaded", title: "Unloaded" }],
    new Set(),
    prefs,
    now,
    summaries,
  );
  assert.deepEqual(
    rows.map(({ band }) => band),
    ["Today", "Last 2 days", "Older", "Outside loaded history"],
  );
  assert.equal(rows[0].messageCount, 10);
  assert.equal(rows.at(-1).messageCount, null);
  assert.equal(
    activeThreadRows(
      roots,
      [],
      new Set(),
      prefs,
      now + 3 * 86400000,
      summaries,
    ).every((row) => row.band === "Older"),
    true,
  );
});
test("manual keep overrides dismissal, unpin returns eligible auto, and invalid counts cannot fabricate automatic rows", () => {
  const roots = [entry("root", 20)];
  assert.equal(
    activeThreadRows(
      roots,
      [{ id: "root", title: "Root" }],
      new Set(["root"]),
      prefs,
      now,
    )[0].automatic,
    false,
  );
  assert.equal(
    activeThreadRows(roots, [], new Set(), prefs, now)[0].automatic,
    true,
  );
  assert.deepEqual(
    activeThreadRows(
      [entry("invalid", NaN), entry("overflow", Infinity)],
      [],
      new Set(),
      prefs,
      now,
    ),
    [],
  );
});

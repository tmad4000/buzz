import assert from "node:assert/strict";
import test from "node:test";
import {
  copyExplicitExpansion,
  seedExplicitExpansion,
  explicitBranches,
  updateExplicitExpansion,
  isExplicitExpansionSnapshot,
} from "./explicitExpansion.ts";
const empty = () => ({ legacySeeded: false, entries: [] });

test("legacy migration preserves true/false, current choices win, and empty migration is final", () => {
  const seeded = seedExplicitExpansion(
    { legacySeeded: false, entries: [["root", [["closed", false]]]] },
    [
      [
        "root",
        new Map([
          ["open", true],
          ["closed", true],
        ]),
      ],
    ],
  );
  assert.deepEqual(
    [...explicitBranches(seeded, "root")],
    [
      ["open", true],
      ["closed", false],
    ],
  );
  assert.deepEqual(
    seedExplicitExpansion(seeded, [["root", new Map([["late", true]])]]),
    seeded,
  );
  const none = seedExplicitExpansion(empty(), []);
  assert.equal(none.legacySeeded, true);
  assert.deepEqual(
    seedExplicitExpansion(none, [["root", new Map([["late", true]])]]),
    none,
  );
});

test("duplicate snapshot and consumer maps never alias; unknown is not explicit collapse", () => {
  const a = seedExplicitExpansion(empty(), [
    [
      "root",
      new Map([
        ["open", true],
        ["closed", false],
      ]),
    ],
  ]);
  const b = copyExplicitExpansion(a);
  const branches = explicitBranches(b, "root");
  assert.equal(branches.get("unknown"), undefined);
  branches.set("open", false);
  assert.equal(explicitBranches(a, "root").get("open"), true);
  const changed = updateExplicitExpansion(b, "root", branches);
  assert.equal(explicitBranches(changed, "root").get("open"), false);
  assert.equal(explicitBranches(b, "root").get("open"), true);
});

test("snapshot rejects automatic/command state, duplicate keys and unbounded input", () => {
  for (const source of [
    { ...empty(), automatic: ["root"] },
    { ...empty(), autoSend: "send" },
    {
      legacySeeded: false,
      entries: [
        [
          "root",
          [
            ["id", true],
            ["id", false],
          ],
        ],
      ],
    },
    {
      legacySeeded: false,
      entries: [
        ["root", []],
        ["root", []],
      ],
    },
    { legacySeeded: false, entries: [["root", [["id", null]]]] },
    {
      legacySeeded: false,
      entries: Array.from({ length: 129 }, (_, i) => [String(i), []]),
    },
    {
      legacySeeded: false,
      entries: [
        ["root", Array.from({ length: 1025 }, (_, i) => [String(i), true])],
      ],
    },
    {
      legacySeeded: false,
      entries: [
        [
          "root",
          Array.from({ length: 1024 }, (_, i) => [
            String(i).padEnd(256, "x"),
            true,
          ]),
        ],
      ],
    },
  ]) {
    assert.equal(isExplicitExpansionSnapshot(source), false);
    assert.throws(() => copyExplicitExpansion(source), RangeError);
  }
});

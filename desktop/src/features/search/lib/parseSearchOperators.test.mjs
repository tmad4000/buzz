import assert from "node:assert/strict";
import test from "node:test";

import {
  formatOperatorValue,
  isChannelUuid,
  isHexPubkey,
  normalizeFromHandle,
  normalizeInChannel,
  parseSearchOperators,
  setSearchOperator,
  shiftDay,
  toOperatorDay,
} from "./parseSearchOperators.ts";

test("leaves plain text unchanged", () => {
  assert.deepEqual(parseSearchOperators("  deploy  "), {
    text: "deploy",
    from: null,
    in: null,
    since: null,
    until: null,
  });
});

test("extracts from / in / after / before and keeps remaining FTS text", () => {
  const parsed = parseSearchOperators(
    "deploy from:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef in:#general after:2024-01-15 before:2024-02-01 status",
  );
  assert.equal(parsed.text, "deploy status");
  assert.equal(
    parsed.from,
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  );
  assert.equal(parsed.in, "#general");
  assert.equal(
    parsed.since,
    Math.floor(new Date(2024, 0, 15).getTime() / 1000),
  );
  assert.equal(
    parsed.until,
    Math.floor(new Date(2024, 1, 1).getTime() / 1000) - 1,
  );
});

test("before: excludes the named day's exact local midnight", () => {
  const localMidnight = Math.floor(new Date(2024, 1, 1).getTime() / 1000);
  const parsed = parseSearchOperators("deploy before:2024-02-01");

  assert.equal(parsed.until, localMidnight - 1);
  // The relay keeps events where `created_at <= until`, so a message stamped
  // exactly at midnight must fail that predicate.
  assert.equal(localMidnight <= parsed.until, false);
});

test("keeps invalid date operators in the FTS text", () => {
  const parsed = parseSearchOperators("notes after:yesterday before:soon");
  assert.equal(parsed.text, "notes after:yesterday before:soon");
  assert.equal(parsed.since, null);
  assert.equal(parsed.until, null);
});

test("later operators of the same kind win", () => {
  const parsed = parseSearchOperators(
    "from:@alice from:@bob in:one in:two after:2024-01-01 after:2024-03-01",
  );
  assert.equal(parsed.from, "@bob");
  assert.equal(parsed.in, "two");
  assert.equal(parsed.since, Math.floor(new Date(2024, 2, 1).getTime() / 1000));
  assert.equal(parsed.text, "");
});

test("rejects impossible calendar dates", () => {
  const parsed = parseSearchOperators("x after:2024-02-30");
  assert.equal(parsed.since, null);
  assert.equal(parsed.text, "x after:2024-02-30");
});

test("does not treat hyphen or slash adjacent tokens as operators", () => {
  assert.deepEqual(parseSearchOperators("built-in:react hooks"), {
    text: "built-in:react hooks",
    from: null,
    in: null,
    since: null,
    until: null,
  });
  assert.deepEqual(parseSearchOperators("sign-in:flow broken"), {
    text: "sign-in:flow broken",
    from: null,
    in: null,
    since: null,
    until: null,
  });
  assert.deepEqual(parseSearchOperators("https://x.com/in:foo"), {
    text: "https://x.com/in:foo",
    from: null,
    in: null,
    since: null,
    until: null,
  });
});

test("strips trailing punctuation from operator values", () => {
  const parsed = parseSearchOperators("deploy in:general, from:@alice.");
  assert.equal(parsed.in, "#general".replace("#", "") || "general");
  assert.equal(parsed.in, "general");
  assert.equal(parsed.from, "@alice");
  assert.equal(parsed.text, "deploy");
});

test("helpers recognize hex pubkeys and channel uuids", () => {
  assert.equal(
    isHexPubkey(
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    ),
    true,
  );
  assert.equal(isHexPubkey("npub1abc"), false);
  assert.equal(isChannelUuid("11111111-1111-1111-1111-111111111111"), true);
  assert.equal(normalizeFromHandle("@alice"), "alice");
  assert.equal(normalizeInChannel("#general"), "general");
});

test("quoted operator values keep spaces and punctuation", () => {
  const parsed = parseSearchOperators(
    'from:"@Will Pfleger" deploy in:"#Paseo P2?"',
  );
  assert.equal(parsed.from, "@Will Pfleger");
  assert.equal(parsed.in, "#Paseo P2?");
  assert.equal(parsed.text, "deploy");
});

test("an unquotable operator stays present instead of widening", () => {
  assert.equal(parseSearchOperators('deploy from:""').from, '""');
});

test("written operators read back exactly", () => {
  for (const value of ["@Will Pfleger", "#general", "what?", "a:b", "日本"]) {
    const query = setSearchOperator("deploy status", "from", value);
    const parsed = parseSearchOperators(query);
    assert.equal(parsed.from, value);
    assert.equal(parsed.text, "deploy status");
  }
  assert.equal(formatOperatorValue('say "hi"'), null);
});

test("setting replaces every earlier operator of that kind only", () => {
  const query = setSearchOperator(
    'from:a deploy in:#x from:"b c" built-in:react',
    "from",
    "@d",
  );
  assert.equal(query, "deploy in:#x built-in:react from:@d ");
  assert.equal(
    setSearchOperator(query, "in", null),
    "deploy built-in:react from:@d",
  );
});

test("date helpers stay on local calendar days", () => {
  assert.equal(toOperatorDay(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(
    toOperatorDay(shiftDay(new Date(2026, 11, 31), 1)),
    "2027-01-01",
  );
});

test("operator text inside a quoted value is never edited", () => {
  const query = 'deploy from:"Ann in:x"';
  assert.equal(setSearchOperator(query, "in", null), query);
  assert.equal(setSearchOperator(query, "in", "#y"), `${query} in:#y `);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { buildThreadPanelIndex } from "./threadPanel.ts";
import {
  buildThreadRoutingEntries,
  resolveNestedRoutingTarget,
} from "./threadRouting.ts";
const message = (id, parentId = null, extra = {}) => ({
  id,
  parentId,
  body: id,
  author: "Jacob",
  pubkey: "author",
  createdAt: 100,
  time: "now",
  depth: 0,
  kind: 9,
  ...extra,
});
test("loaded index contributes subthread participants/recency, and explicit targets retain canonical root", () => {
  const messages = [
    message("canonical"),
    message("head", "canonical"),
    message("child", "head"),
    message("deep", "child", { createdAt: 200, author: "Nora" }),
    message("sibling", "canonical"),
  ];
  const entries = buildThreadRoutingEntries(
    messages,
    buildThreadPanelIndex(messages),
  );
  assert.equal(
    entries.find((x) => x.message.id === "child").summary.replyCount,
    1,
  );
  assert.equal(
    entries.find((x) => x.message.id === "child").summary.lastReplyAt,
    200,
  );
  assert.equal(
    entries.find((x) => x.message.id === "child").summary.participants[0]
      .author,
    "Nora",
  );
  const scope = { headId: "head", rootEventId: "canonical" };
  assert.deepEqual(resolveNestedRoutingTarget(scope, entries, "deep"), {
    parentEventId: "deep",
    threadHeadId: "canonical",
  });
  assert.deepEqual(resolveNestedRoutingTarget(scope, entries, null), {
    parentEventId: "head",
    threadHeadId: "canonical",
  });
  for (const id of ["sibling", "canonical", "head", "unknown"])
    assert.equal(resolveNestedRoutingTarget(scope, entries, id), null);
});
test("stale/pending/system choices cannot submit even when structurally descended", () => {
  const messages = [
    message("head"),
    message("pending", "head", { pending: true }),
    message("system", "head", { kind: 40099 }),
  ];
  const entries = buildThreadRoutingEntries(
    messages,
    buildThreadPanelIndex(messages),
  );
  for (const id of ["pending", "system", "deleted"])
    assert.equal(
      resolveNestedRoutingTarget(
        { headId: "head", rootEventId: "head" },
        entries,
        id,
      ),
      null,
    );
});

test("pending/synthetic thread heads cannot become root fallback destinations", () => {
  for (const head of [
    message("head", null, { pending: true }),
    message("outbox-local:head"),
  ]) {
    const entries = buildThreadRoutingEntries(
      [head],
      buildThreadPanelIndex([head]),
    );
    assert.equal(
      resolveNestedRoutingTarget(
        { headId: head.id, rootEventId: head.id },
        entries,
        null,
      ),
      null,
    );
  }
});

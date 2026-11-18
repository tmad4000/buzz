import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBridgeStatusCard } from "./bridgeStatusCard.ts";
import { getThreadReference } from "./threading.ts";
const agent = "d809bb50-03b8-41d2-ba83-e2a18cb86a89",
  server = "srv_KIFHQ_zsBnI2";
const href = `paseo://h/${server}/agent/${agent}`;
const body = (label = "⏳ Working", source = "root") =>
  `${label} — Astra · configured-model (codex)\nAgent \`${agent}\` · server \`${server}\`\n[Open agent](${href})\nReported status · source: ${source}`;
const message = {
  id: "card",
  parentId: "parent",
  kind: 9,
  signerPubkey:
    "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb",
  body: body(),
};
test("report preserves exact executor and host without claiming live work", () => {
  const card = parseBridgeStatusCard(message);
  assert.equal(card.href, href);
  assert.equal(card.label, "⏳ Reported working");
  assert.equal(card.title, "Astra");
});
test("unknown, impersonated and substantive content retain original body", () => {
  for (const patch of [
    { signerPubkey: "other", pubkey: message.signerPubkey },
    { signerPubkey: undefined },
    { kind: 1 },
    { parentId: null },
    { body: body() + "\nAnswer follows" },
    { body: body().replace(href, "https://example.com") },
    { body: body().replace(href, href + "/extra") },
    { body: body("✅ Done", "listener") },
    { body: body("❓ Needs Jacob", "watchdog") },
    { body: body("Unknown") },
    { body: body().replace(server, "srv_otherhost") },
  ])
    assert.equal(
      parseBridgeStatusCard({ ...message, ...patch }),
      null,
      JSON.stringify(patch),
    );
});
test("edits, watchdog source and stale metadata stay explicit", () => {
  assert.equal(
    parseBridgeStatusCard({ ...message, body: body("✅ Done") }).label,
    "✅ Reported done",
  );
  const overdue = parseBridgeStatusCard({
    ...message,
    body:
      body("⚠️ Agent response overdue", "watchdog") +
      "\nMetadata unavailable; last verified at Unix 123",
  });
  assert.equal(overdue.label, "⚠️ Agent response overdue");
  assert.match(overdue.metadataUnavailable, /Unix 123/);
});
test("root+reply tags retain exact answered event", () =>
  assert.deepEqual(
    getThreadReference([
      ["e", "root", "", "root"],
      ["e", "exact-parent", "", "reply"],
    ]),
    { rootId: "root", parentId: "exact-parent" },
  ));

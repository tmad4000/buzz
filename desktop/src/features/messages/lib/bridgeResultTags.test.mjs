import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// A synthetic bridge signature at the verifier boundary. Production code
// still selects the winning raw revision and projects the result tag.
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "nostr-tools/pure" &&
      context.parentURL?.endsWith("/bridgeResultTags.ts")
    ) {
      return { shortCircuit: true, url: "result-fixture:verify" };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    return url === "result-fixture:verify"
      ? {
          shortCircuit: true,
          format: "module",
          source:
            'export const verifyEvent = event => event.sig === "fixture:" + event.content;',
        }
      : next(url, context);
  },
});

const { BRIDGE_STATUS_SIGNER } = await import("./bridgeStatusCard.ts");
const { formatTimelineMessages } = await import("./formatTimelineMessages.ts");
const { parseResultCard } = await import("../../results/resultCards.ts");
const channel = "f131f292-2565-4d48-9dbd-7dfad754ad6f";
const root = "a".repeat(64);
const parent = "b".repeat(64);
const agent = "83af8669-54dc-472a-a817-c73925b0d55c";
const native = [
  ["h", channel],
  ["e", root, "", "root"],
  ["e", parent, "", "reply"],
];
const envelope = [
  ["agent", agent, "srv_testnode", "Research agent"],
  ["paseo-link", `paseo://h/srv_testnode/agent/${agent}`],
  ["buzz-status", "done"],
  ["buzz-status-source", "root"],
];
const result = [
  "buzz-result",
  "1",
  "channel-page",
  "result-brief",
  "Brief",
  "Early findings",
];
const original = {
  id: "c".repeat(64),
  kind: 9,
  pubkey: BRIDGE_STATUS_SIGNER,
  created_at: 200,
  content: "Original",
  sig: "fixture:Original",
  tags: [...native, ...envelope, result],
};
const replacement = [
  "buzz-result",
  "1",
  "channel-page",
  "result-brief",
  "Revised",
  "Later findings",
];
const edit = {
  id: "d".repeat(64),
  kind: 40003,
  pubkey: BRIDGE_STATUS_SIGNER,
  created_at: 201,
  content: "Edited",
  sig: "fixture:Edited",
  tags: [["e", original.id], ...envelope, replacement],
};
const project = (...events) =>
  formatTimelineMessages(events, null).find(
    (message) => message.id === original.id,
  );

test("a verified bridge snapshot replaces the result and retains original ancestry", () => {
  assert.equal(parseResultCard(project(original), channel).title, "Brief");
  const projected = project(original, edit);
  assert.deepEqual(
    projected.tags.filter(([name]) => name === "h" || name === "e"),
    native,
  );
  assert.equal(projected.body, "Edited");
  const parsed = parseResultCard(projected, channel);
  assert.equal(parsed.title, "Revised");
  assert.equal(parsed.messageId, original.id);
  assert.equal(parsed.rootId, root);
  assert.equal(parsed.parentId, parent);
});

test("winning clears, malformed snapshots and failed signature verification cannot retain or add a result", () => {
  for (const winningEdit of [
    { ...edit, tags: edit.tags.slice(0, -1) },
    { ...edit, tags: [edit.tags[0]] },
    { ...edit, tags: [...edit.tags, replacement] },
    { ...edit, sig: "bad" },
    { ...edit, pending: true },
  ]) {
    assert.equal(
      parseResultCard(project(original, winningEdit), channel),
      null,
    );
  }
  assert.equal(
    parseResultCard(project({ ...original, sig: "bad" }, edit), channel),
    null,
  );
});

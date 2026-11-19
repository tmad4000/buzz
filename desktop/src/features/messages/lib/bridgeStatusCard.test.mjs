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
    { body: `${body()}\nAnswer follows` },
    { body: body().replace(href, "https://example.com") },
    { body: body().replace(href, `${href}/extra`) },
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
  assert.equal(overdue.label, "⚠️ Reported overdue");
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

const originEventId = "a".repeat(64);
const machineTags = (state = "progress") => [
  ["buzz-status", state],
  ["buzz-status-source", "root"],
  ["agent", agent, server, "Astra"],
  ["paseo-link", href],
  ["e", "b".repeat(64), "", "root"],
  ["e", originEventId, "", "reply"],
];
test("structured bridge tags outrank body and bind exact originating request", () => {
  const card = parseBridgeStatusCard({
    ...message,
    tags: machineTags("done"),
    body: "An old working body",
  });
  assert.equal(card.label, "✅ Reported done");
  assert.equal(card.originEventId, originEventId);
  assert.equal(card.href, href);
  assert.equal(card.title, "Astra");
  assert.equal(
    parseBridgeStatusCard({ ...message, tags: machineTags("waiting") }).label,
    "❓ Reported waiting",
  );
});
test("malformed machine envelopes cannot downgrade into legacy body trust", () => {
  for (const tags of [
    machineTags("toString"),
    machineTags("unknown"),
    [...machineTags(), ["buzz-status", "done"]],
    machineTags().filter((t) => t[0] !== "agent"),
    [...machineTags(), ["agent", agent, server]],
    machineTags().map((t) =>
      t[0] === "paseo-link" ? ["paseo-link", `${href}/extra`] : t,
    ),
    machineTags().map((t) =>
      t[0] === "agent" ? ["agent", "short", server] : t,
    ),
    machineTags().filter((t) => t[3] !== "reply"),
    [...machineTags(), ["e", "c".repeat(64), "", "reply"]],
    [...machineTags(), ["buzz-status-source", "untrusted"]],
  ])
    assert.equal(
      parseBridgeStatusCard({ ...message, tags }),
      null,
      JSON.stringify(tags),
    );
  for (const signerPubkey of ["other", undefined])
    assert.equal(
      parseBridgeStatusCard({ ...message, signerPubkey, tags: machineTags() }),
      null,
    );
  assert.equal(
    parseBridgeStatusCard({
      ...message,
      editSignerPubkey: "other",
      tags: machineTags(),
    }),
    null,
  );
});

test("production formatter applies only bridge-signed status snapshots and preserves immutable ancestry", async () => {
  const { formatTimelineMessages } = await import(
    "./formatTimelineMessages.ts"
  );
  const channelId = "36411e44-0e2d-4cfe-bd6e-567eb169db9f";
  const original = {
    id: "c".repeat(64),
    kind: 9,
    pubkey: message.signerPubkey,
    created_at: 1_700_000_000,
    content: body(),
    tags: [["h", channelId], ...machineTags()],
    sig: "synthetic",
  };
  const edit = {
    id: "d".repeat(64),
    kind: 40003,
    pubkey: message.signerPubkey,
    created_at: 1_700_000_001,
    content: "Structured report",
    tags: [
      ["e", original.id],
      ...machineTags("done").filter((tag) => tag[0] !== "e"),
    ],
    sig: "synthetic",
  };
  const format = (e, profiles) =>
    formatTimelineMessages([original, e], null, undefined, null, profiles).find(
      (m) => m.id === original.id,
    );
  const updated = format(edit);
  assert.deepEqual(updated.bodyRevision,{eventId:edit.id,createdAt:edit.created_at});
  assert.equal(parseBridgeStatusCard(updated).label, "✅ Reported done");
  assert.equal(parseBridgeStatusCard(updated).originEventId, originEventId);
  assert.equal(updated.parentId, originEventId);
  const legacy = format({
    ...edit,
    content: body("✅ Done"),
    tags: [["e", original.id]],
  });
  assert.equal(parseBridgeStatusCard(legacy).label, "✅ Reported done");
  assert.equal(
    legacy.tags.some((t) => t[0] === "buzz-status"),
    false,
    "legacy edit drops stale machine progress",
  );
  const rejected = format({ ...edit, pubkey: "e".repeat(64) });
  assert.equal(
    parseBridgeStatusCard(rejected).label,
    "⏳ Reported working",
    "unauthorized edit does not apply",
  );
  const ownerSigner = "e".repeat(64);
  const ownerEdit = format(
    { ...edit, pubkey: ownerSigner },
    { [message.signerPubkey]: { ownerPubkey: ownerSigner } },
  );
  assert.equal(
    ownerEdit.body,
    "Structured report",
    "owner-authorized edit is ordinary valid content",
  );
  assert.equal(
    parseBridgeStatusCard(ownerEdit),
    null,
    "owner edit is not a bridge-signed report",
  );
});

test("reviewer P1 reproduction: latest owner-signed Done body never inherits the original bridge signer", async () => {
  const { formatTimelineMessages } = await import(
    "./formatTimelineMessages.ts"
  );
  const bridge = message.signerPubkey,
    owner = "2".repeat(64),
    originalId = "a".repeat(64);
  const doneBody = `✅ Done — Forged report · model (codex)\nAgent \`${agent}\` · server \`${server}\`\n[Open agent](${href})\nReported status · source: root`;
  const original = {
    id: originalId,
    pubkey: bridge,
    kind: 9,
    created_at: 1700000000,
    content: "ordinary original body",
    tags: [
      ["h", "channel"],
      ["e", "b".repeat(64), "", "reply"],
    ],
    sig: "fixture",
  };
  const edit = {
    id: "c".repeat(64),
    pubkey: owner,
    kind: 40003,
    created_at: 1700000001,
    content: doneBody,
    tags: [
      ["h", "channel"],
      ["e", originalId],
    ],
    sig: "fixture",
  };
  const profiles = { [bridge]: { ownerPubkey: owner } };
  const format = (events) =>
    formatTimelineMessages(events, null, undefined, null, profiles)[0];
  const ownerEdited = format([original, edit]);
  assert.deepEqual(format([original]).bodyRevision,{eventId:original.id,createdAt:original.created_at});
  assert.deepEqual(ownerEdited.bodyRevision,{eventId:edit.id,createdAt:edit.created_at});
  assert.equal(ownerEdited.signerPubkey, bridge);
  assert.equal(
    ownerEdited.body,
    doneBody,
    "ordinary owner edit permission is preserved",
  );
  assert.equal(
    ownerEdited.editSignerPubkey,
    owner,
    "effective body signer is explicit",
  );
  assert.equal(
    parseBridgeStatusCard(ownerEdited),
    null,
    "exact Done envelope from owner stays plain text",
  );
  const bridgeEdit = {
    ...edit,
    id: "d".repeat(64),
    pubkey: bridge,
    created_at: 1700000002,
  };
  assert.equal(
    parseBridgeStatusCard(format([original, edit, bridgeEdit])).label,
    "✅ Reported done",
    "latest bridge edit authenticates its own body",
  );
  const laterOwner = { ...edit, id: "e".repeat(64), created_at: 1700000003 };
  assert.equal(
    parseBridgeStatusCard(format([original, bridgeEdit, laterOwner])),
    null,
    "later owner edit supersedes an earlier bridge edit",
  );
  const unrelated = { ...edit, pubkey: "3".repeat(64) };
  assert.equal(
    format([original, unrelated]).body,
    original.content,
    "unrelated edit remains unauthorized",
  );
  const localPatch = {
    ...original,
    content: doneBody,
    localEditedContent: true,
  };
  assert.equal(format([localPatch]).bodyRevision,undefined);
  assert.deepEqual(format([localPatch,bridgeEdit]).bodyRevision,{eventId:bridgeEdit.id,createdAt:bridgeEdit.created_at});
  assert.equal(
    parseBridgeStatusCard(format([localPatch])),
    null,
    "unverified post-edit cache body is never attributed to original signer",
  );
  assert.equal(
    parseBridgeStatusCard(format([localPatch, bridgeEdit])).label,
    "✅ Reported done",
    "verified edit provenance replaces the local uncertainty marker",
  );
  assert.equal(
    parseBridgeStatusCard({ ...message, edited: true }),
    null,
    "an edited TimelineMessage without provenance fails closed",
  );
});

test("current producer unsigned fixture projects exact body and lowest-ID equal-time edit independently of input order", async () => {
  const {readFileSync} = await import("node:fs");
  const fixture = JSON.parse(readFileSync(new URL("./bridgeStatusCard.contract-fixture.json", import.meta.url)));
  assert.equal(fixture.cryptographicVerification, false);
  const {formatTimelineMessages} = await import("./formatTimelineMessages.ts");
  const original = fixture.original;
  const low = {...fixture.revisions[0], id:"1".repeat(64)};
  const high = {...fixture.revisions[1], id:"f".repeat(64), created_at:low.created_at};
  for (const edits of [[low,high],[high,low]]) {
    const result = formatTimelineMessages([original,...edits],null).find(m=>m.id===original.id);
    assert.equal(result.body,low.content);
    assert.equal(parseBridgeStatusCard(result).label,"✅ Reported done");
  }
  const later = {...high,created_at:low.created_at+1};
  const selectedLater = formatTimelineMessages([original,low,later],null).find(m=>m.id===original.id);
  assert.equal(selectedLater.body,later.content);
  const deletion = {id:"9".repeat(64),kind:5,pubkey:original.pubkey,created_at:low.created_at+2,content:"",tags:[["e",low.id]]};
  const reverted = formatTimelineMessages([original,high,low,deletion],null).find(m=>m.id===original.id);
  assert.equal(reverted.body,high.content);
  const originalMessage = formatTimelineMessages([original],null)[0];
  assert.equal(parseBridgeStatusCard(originalMessage).agentId, fixture.expected.afterFirstRevision.agentId);
  assert.ok(parseBridgeStatusCard({...originalMessage,body:fixture.metadataUnavailableExampleContent}).metadataUnavailable);
  for (const body of [
    original.content+"\n",
    original.content.replace("Example agent","x".repeat(161)),
    original.content.replace("example-model","x".repeat(81)),
    original.content.replace("example-provider","x".repeat(41)),
    original.content.replace("Example agent","bad\tlabel"),
  ]) assert.equal(parseBridgeStatusCard({...originalMessage,body}),null);
});

test("pure producer label fixtures accept decoded code-point bounds, escapes and Unicode sanitation", async () => {
  const {readFileSync}=await import("node:fs");
  const fixtures=JSON.parse(readFileSync(new URL("./bridgeStatusCard.label-fixtures.json",import.meta.url)));
  assert.equal(fixtures.fixtureType,"SYNTHETIC_UNSIGNED_PURE_RENDERER_OUTPUT");
  for(const fixture of fixtures.cases) {
    const card=parseBridgeStatusCard({...message,body:fixture.content});
    assert.ok(card,fixture.name);
    for(const key of ["title","model","provider"]) assert.equal(card[key],fixture.expectedLabels[key],fixture.name+" "+key);
  }
  const excluded = [0x85,0x200b,0xe000,0x378,0x1fae9,0xd800]
    .map(codepoint => "A"+String.fromCodePoint(codepoint)+"B");
  for(const title of [...excluded,"bad*escape",String.fromCharCode(92)+"q", "dangling"+String.fromCharCode(92)]) {
    assert.equal(parseBridgeStatusCard({...message,body:body().replace("Astra",title)}),null,JSON.stringify(title));
  }
});
test("prospective classification keeps originating Nostr event distinct and Root-only state constraints", () => {
  for(const state of ["waiting","done","ack"]) {
    for(const source of ["listener","watchdog",undefined]) {
      const tags=machineTags(state).filter(t=>t[0]!=="buzz-status-source");
      if(source) tags.push(["buzz-status-source",source]);
      assert.equal(parseBridgeStatusCard({...message,tags}),null);
    }
    const card=parseBridgeStatusCard({...message,tags:machineTags(state)});
    assert.equal(card.originEventId,originEventId);
    assert.equal("requestId" in card,false);
  }
});

test("bridge body revision selection uses lowest event ID for equal signed created_at in either input order", async () => {
  const {formatTimelineMessages}=await import("./formatTimelineMessages.ts");
  const original={id:"f".repeat(64),kind:9,pubkey:message.signerPubkey,created_at:1,content:body(),tags:[["h","channel"],["e","b".repeat(64),"","reply"]]};
  const low={id:"1".repeat(64),kind:40003,pubkey:message.signerPubkey,created_at:2,content:body("✅ Done"),tags:[["e",original.id],["h","channel"]]};
  const high={...low,id:"e".repeat(64),content:body()};
  for(const edits of [[low,high],[high,low]]) {
    const projected=formatTimelineMessages([original,...edits],null)[0];
    assert.equal(projected.body,low.content);
    assert.deepEqual(projected.bodyRevision,{eventId:low.id,createdAt:low.created_at});
  }
});

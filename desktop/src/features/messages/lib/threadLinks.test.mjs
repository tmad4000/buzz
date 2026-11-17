import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent } from "nostr-tools/pure";

import {
  THREAD_LINK_MARKER,
  isThreadLinkCandidate,
  parseThreadLink,
  validThreadLinkScope,
  verifiedThreadMessage,
} from "./threadLinks.ts";

// Synthetic test identity; never a user's key or an environment credential.
const key = new Uint8Array(32).fill(1);
const channel = "11111111-2222-4333-8444-555555555555";
const scope = { communityUrl: "https://relay.example", channelId: channel };
const child = "a".repeat(64);
const parent = "b".repeat(64);
const baseTags = () => [
  ["h", channel],
  ["t", THREAD_LINK_MARKER],
  ["buzz-thread-op", "link"],
  ["buzz-thread-child", child],
  ["buzz-thread-parent", parent],
  ["buzz-thread-previous", "none"],
];
const signed = (tags = baseTags(), patch = {}) =>
  finalizeEvent(
    {
      kind: 9,
      created_at: 100,
      content: "Thread organization.",
      tags,
      ...patch,
    },
    key,
  );
const invalid = (event, reason) => {
  const result = parseThreadLink(event, scope);
  assert.equal(result.state, "invalid");
  if (reason) assert.equal(result.reason, reason);
};

test("signed v1 annotation parses metadata without copying source bodies", () => {
  const event = signed();
  assert.equal(isThreadLinkCandidate(event), true);
  assert.deepEqual(parseThreadLink(event, scope), {
    state: "valid",
    annotation: {
      id: event.id,
      authorPubkey: event.pubkey,
      createdAt: 100,
      operation: "link",
      childId: child,
      parentId: parent,
      previousId: null,
    },
  });
  assert.equal(
    parseThreadLink(signed([["h", channel]]), scope).state,
    "not-annotation",
  );
});

test("unlink has no parent and retains the exact previous annotation id", () => {
  const tags = baseTags().filter(([name]) => name !== "buzz-thread-parent");
  tags.find(([name]) => name === "buzz-thread-op")[1] = "unlink";
  tags.find(([name]) => name === "buzz-thread-previous")[1] = "c".repeat(64);
  const result = parseThreadLink(signed(tags), scope);
  assert.equal(result.state, "valid");
  assert.equal(result.annotation.parentId, null);
  assert.equal(result.annotation.previousId, "c".repeat(64));
});

test("tampering hash, signature or cached-verified event content fails closed", () => {
  const original = signed();
  // finalizeEvent caches verified=true on a symbol. Mutating that object must
  // not bypass the production verifier's fresh-copy hash/signature check.
  original.content = "tampered after verification";
  invalid(original, "invalid-signed-envelope");
  for (const patch of [{ id: "d".repeat(64) }, { sig: "0".repeat(128) }]) {
    invalid({ ...signed(), ...patch }, "invalid-signed-envelope");
  }
});

test("wrong channel, ambiguous channel, nonmessage kind and invalid scope reject", () => {
  invalid(
    signed(
      baseTags().map((tag) =>
        tag[0] === "h" ? ["h", "00000000-0000-0000-0000-000000000000"] : tag,
      ),
    ),
  );
  invalid(signed([...baseTags(), ["h", channel]]));
  invalid(signed(baseTags(), { kind: 40002 }));
  for (const communityUrl of [
    "file:///tmp/relay",
    "https://x:y@relay.example",
    "https://relay.example?q=1",
  ]) {
    assert.equal(validThreadLinkScope({ ...scope, communityUrl }), false);
    assert.equal(
      parseThreadLink(signed(), { ...scope, communityUrl }).state,
      "invalid",
    );
  }
});

test("duplicate, extra, native-thread and attribution tags reject", () => {
  for (const extra of [
    ["buzz-thread-child", child],
    ["buzz-thread-op", "unlink"],
    ["e", child, "", "reply"],
    ["p", child],
    ["actor", child],
    ["broadcast", "1"],
    ["buzz-thread-grant", parent],
    ["t", "another-version"],
  ])
    invalid(signed([...baseTags(), extra]), "unexpected-or-duplicate-tag");
  invalid(signed([...baseTags(), ["extension", "value", "extra"]]));
});

test("missing fields, malformed IDs, unknown operations and self-link reject", () => {
  for (const name of [
    "buzz-thread-op",
    "buzz-thread-child",
    "buzz-thread-parent",
    "buzz-thread-previous",
  ]) {
    invalid(
      signed(baseTags().filter(([tag]) => tag !== name)),
      "invalid-operation",
    );
  }
  for (const [name, value] of [
    ["buzz-thread-op", "move"],
    ["buzz-thread-child", "A".repeat(64)],
    ["buzz-thread-parent", "short"],
    ["buzz-thread-previous", ""],
    ["buzz-thread-op", "unlink"],
  ])
    invalid(
      signed(baseTags().map((tag) => (tag[0] === name ? [name, value] : tag))),
      "invalid-operation",
    );
  invalid(
    signed(
      baseTags().map((tag) =>
        tag[0] === "buzz-thread-parent" ? [tag[0], child] : tag,
      ),
    ),
    "self-link",
  );
});

test("runtime envelope validation rejects invalid shape and bounded resources", () => {
  for (const patch of [
    { created_at: -1 },
    { created_at: 1.5 },
    { created_at: NaN },
    { content: "x".repeat(262145) },
    { tags: new Array(129).fill(["h", channel]) },
    {
      tags: [
        ["h", channel],
        ["x", 1],
      ],
    },
    {
      tags: [
        ["h", channel],
        ["x", "x".repeat(16385)],
      ],
    },
    { tags: [["h", channel], new Array(17).fill("x")] },
    { tags: [["h", channel], []] },
  ])
    assert.equal(
      verifiedThreadMessage({ ...signed(), ...patch }, channel),
      null,
    );
  for (const value of [null, undefined, "text", [], {}]) {
    assert.equal(verifiedThreadMessage(value, channel), null);
    assert.equal(isThreadLinkCandidate(value), false);
  }
});

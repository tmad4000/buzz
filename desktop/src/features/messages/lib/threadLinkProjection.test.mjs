import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent, getPublicKey, verifyEvent } from "nostr-tools/pure";

import { buildReplyTags, resolveReplyRootId } from "./threading.ts";
import { THREAD_LINK_MARKER } from "./threadLinks.ts";
import {
  projectThreadLinks,
  THREAD_LINK_LIMITS,
} from "./threadLinkProjection.ts";

// Synthetic fixed identities make signed fixture IDs deterministic.
const alice = new Uint8Array(32).fill(1);
const bob = new Uint8Array(32).fill(2);
const relay = new Uint8Array(32).fill(3);
const channel = "11111111-2222-4333-8444-555555555555";
const scope = { communityUrl: "https://relay.example", channelId: channel };
function message(key, time, parent = null, root = parent, extra = []) {
  const tags = [...extra, ["h", channel]];
  if (parent) {
    if (root !== parent) tags.push(["e", root.id, "", "root"]);
    tags.push(["e", parent.id, "", "reply"]);
  }
  return finalizeEvent(
    { kind: 9, created_at: time, content: `fixture ${time}`, tags },
    key,
  );
}
function link(key, time, child, parent, previous = null) {
  const tags = [
    ["h", channel],
    ["t", THREAD_LINK_MARKER],
    ["buzz-thread-op", parent ? "link" : "unlink"],
    ["buzz-thread-child", typeof child === "string" ? child : child.id],
    ["buzz-thread-previous", previous?.id ?? previous ?? "none"],
  ];
  if (parent)
    tags.push([
      "buzz-thread-parent",
      typeof parent === "string" ? parent : parent.id,
    ]);
  return finalizeEvent(
    { kind: 9, created_at: time, content: "Thread organization.", tags },
    key,
  );
}
const project = (messages, annotations, patch = {}) =>
  projectThreadLinks({
    scope,
    messages,
    annotations,
    historyComplete: true,
    ...patch,
  });
const decision = (result, event) =>
  result.decisions.find((item) => item.annotationId === event.id);

test("own message moves, native descendants follow, signed originals and sends remain canonical", () => {
  const root = message(bob, 1),
    child = message(alice, 2);
  const reply = message(alice, 3, child);
  const originals = [root, child, reply];
  const before = JSON.stringify(originals);
  for (const event of originals) {
    for (const tag of event.tags) Object.freeze(tag);
    Object.freeze(event.tags);
    Object.freeze(event);
  }
  const annotation = link(alice, 10, child, root);
  const result = project(originals, [annotation]);
  assert.equal(result.status, "complete");
  assert.equal(result.messages.get(child.id).canonicalParentId, null);
  assert.equal(result.messages.get(child.id).canonicalRootId, null);
  assert.equal(result.messages.get(child.id).presentationParentId, root.id);
  assert.equal(result.messages.get(reply.id).canonicalRootId, child.id);
  assert.equal(result.messages.get(reply.id).presentationRootId, root.id);
  assert.equal(result.messages.get(reply.id).presentationDepth, 2);
  assert.equal(result.heads.get(child.id), annotation.id);
  assert.equal(JSON.stringify(originals), before);
  assert.equal(originals.every(verifyEvent), true);
  const wireRoot = resolveReplyRootId(child.id, originals);
  assert.equal(wireRoot, child.id);
  assert.deepEqual(
    buildReplyTags(channel, getPublicKey(alice), child.id, wireRoot).filter(
      ([tag]) => tag === "e",
    ),
    [["e", child.id, "", "reply"]],
  );
  assert.equal(
    JSON.stringify([...result.messages.values()]).includes("fixture"),
    false,
  );
});

test("cross-author and arbitrary p attribution reject; relay-authored attribution needs trusted relay", () => {
  const root = message(bob, 1);
  const child = message(alice, 2, null, null, [["p", getPublicKey(bob)]]);
  const wrong = link(bob, 10, child, root);
  assert.equal(
    decision(project([root, child], [wrong]), wrong).reason,
    "not-child-author",
  );
  const attributed = message(relay, 3, null, null, [
    ["p", getPublicKey(alice)],
  ]);
  const owner = link(alice, 11, attributed, root);
  assert.equal(
    decision(project([root, attributed], [owner]), owner).reason,
    "not-child-author",
  );
  const trusted = project([root, attributed], [owner], {
    scope: { ...scope, relaySelfPubkey: getPublicKey(relay) },
  });
  assert.equal(decision(trusted, owner).state, "selected");
});

test("unlink restores original canonical parent and records a new head", () => {
  const original = message(bob, 1),
    other = message(bob, 2);
  const child = message(alice, 3, original);
  const moved = link(alice, 10, child, other);
  const undo = link(alice, 11, child, null, moved);
  const result = project([original, other, child], [undo, moved]);
  assert.equal(result.status, "complete");
  assert.equal(result.messages.get(child.id).presentationParentId, original.id);
  assert.equal(result.messages.get(child.id).canonicalParentId, original.id);
  assert.equal(result.heads.get(child.id), undo.id);
});

test("same-head conflicts converge in timestamp/id order, duplicates do not apply twice", () => {
  const a = message(bob, 1),
    b = message(bob, 2),
    child = message(alice, 3);
  const one = link(alice, 10, child, a),
    two = link(alice, 10, child, b);
  const winner = one.id < two.id ? one : two;
  const loser = winner === one ? two : one;
  for (const events of [
    [one, two, one],
    [two, one, two],
  ]) {
    const result = project([child, a, b], events);
    assert.equal(result.heads.get(child.id), winner.id);
    assert.equal(decision(result, loser).reason, "stale-head");
    assert.equal(result.decisions.length, 2);
  }
});

test("new owner operation can resolve conflict by naming the selected head", () => {
  const a = message(bob, 1),
    b = message(bob, 2),
    child = message(alice, 3);
  const first = link(alice, 10, child, a);
  const conflict = link(alice, 11, child, b);
  const resolve = link(alice, 12, child, b, first);
  const result = project([a, b, child], [resolve, conflict, first]);
  assert.equal(result.heads.get(child.id), resolve.id);
  assert.equal(decision(result, conflict).state, "conflict");
  assert.equal(result.messages.get(child.id).presentationParentId, b.id);
});

test("cycle guards include canonical and accepted overlay edges", () => {
  const a = message(alice, 1),
    b = message(alice, 2, a);
  const cyclic = link(alice, 10, a, b);
  const result = project([a, b], [cyclic]);
  assert.equal(decision(result, cyclic).reason, "cycle");
  assert.equal(result.messages.get(a.id).presentationParentId, null);
  const x = message(alice, 3),
    y = message(alice, 4);
  const xy = link(alice, 11, x, y),
    yx = link(alice, 12, y, x);
  const overlays = project([x, y], [yx, xy]);
  assert.equal(decision(overlays, xy).state, "selected");
  assert.equal(decision(overlays, yx).reason, "cycle");
});

test("moving a subtree enforces depth on descendants, including the exact100 boundary", () => {
  const chain = [message(alice, 1)];
  for (let i = 1; i <= 99; i++)
    chain.push(message(alice, i + 1, chain.at(-1), chain[0]));
  const child = message(alice, 200),
    descendant = message(alice, 201, child);
  const tooDeep = link(alice, 300, child, chain[99]);
  assert.equal(
    decision(project([...chain, child, descendant], [tooDeep]), tooDeep).reason,
    "depth-limit",
  );
  const boundary = link(alice, 301, child, chain[98]);
  const result = project([...chain, child, descendant], [boundary]);
  assert.equal(result.status, "complete");
  assert.equal(result.messages.get(descendant.id).presentationDepth, 100);
});

test("incomplete history, child, ancestor or predecessor keeps canonical positions", () => {
  const root = message(bob, 1),
    child = message(alice, 2);
  const good = link(alice, 10, child, root);
  const cases = [
    project([root, child], [good], { historyComplete: false }),
    project([root], [good]),
    project([child], [good]),
    project([root, child], [link(alice, 10, child, root, "f".repeat(64))]),
  ];
  for (const result of cases) {
    assert.equal(result.status, "incomplete");
    assert.equal(result.heads.size, 0);
    assert.equal(
      result.messages.get(child.id)?.presentationParentId ?? null,
      null,
    );
    assert.equal(
      result.decisions.some((item) => item.state === "selected"),
      false,
    );
  }
  const missing = message(alice, 3, root);
  assert.equal(
    project([missing, child], [link(alice, 11, child, missing)]).status,
    "incomplete",
  );
});

test("tampered originals, bad native root and bounds never become authoritative empty results", () => {
  const root = message(bob, 1),
    child = message(alice, 2);
  const annotation = link(alice, 10, child, root);
  const corrupted = { ...child, content: "tampered" };
  const result = project([root, corrupted], [annotation]);
  assert.equal(result.status, "incomplete");
  assert.equal(
    result.issues.some((issue) => issue.startsWith("invalid-message:")),
    true,
  );
  const other = message(bob, 3);
  const wrongRoot = message(alice, 4, root, other);
  assert.equal(project([root, other, wrongRoot], []).status, "incomplete");
  const overflow = project(
    [root],
    new Array(THREAD_LINK_LIMITS.annotations + 1).fill(annotation),
  );
  assert.deepEqual(overflow.issues, ["snapshot-limit"]);
  assert.equal(overflow.status, "incomplete");
  assert.equal(
    project(new Array(THREAD_LINK_LIMITS.messages + 1).fill(root), []).status,
    "incomplete",
  );
});

test("proven absent references reject bad operations while unknown reads stay pending", () => {
  const root = message(bob, 1),
    child = message(alice, 2),
    other = message(alice, 3);
  const missingId = "f".repeat(64);
  const good = link(alice, 10, other, root);
  for (const [bad, expected] of [
    [link(alice, 11, missingId, root), "unavailable-child"],
    [link(alice, 11, child, missingId), "unavailable-ancestor"],
    [link(alice, 11, child, root, missingId), "unavailable-predecessor"],
  ]) {
    const unknown = project([root, child, other], [good, bad]);
    assert.equal(unknown.status, "incomplete");
    assert.equal(unknown.heads.size, 0);
    const proven = project([root, child, other], [good, bad], {
      unavailableEventIds: new Set([missingId]),
    });
    assert.equal(proven.status, "complete");
    assert.equal(proven.heads.get(other.id), good.id);
    assert.equal(decision(proven, bad).state, "rejected");
    assert.equal(decision(proven, bad).reason, expected);
  }
});

test("malformed reserved envelopes reject rather than silently becoming selected", () => {
  const root = message(bob, 1),
    child = message(alice, 2);
  const annotation = link(alice, 10, child, root);
  annotation.content = "cached verified symbol must not win";
  const result = project([root, child], [annotation, root]);
  assert.equal(result.status, "complete");
  assert.equal(result.heads.size, 0);
  assert.equal(
    result.decisions.every((item) => item.state === "rejected"),
    true,
  );
  const invalidScope = project([root], [], {
    scope: { ...scope, channelId: "not-a-channel" },
  });
  assert.equal(invalidScope.status, "incomplete");
});

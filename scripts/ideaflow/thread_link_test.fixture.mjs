import assert from "node:assert/strict";
import {
  DM,
  JACOB,
  RELAY,
  finalizeEvent,
  getPublicKey,
  hash,
  verifyEvent,
} from "./thread_link_common.mjs";
import { createClient } from "./thread_link_transport.mjs";

// Public synthetic test keys. No environment or established user key is read.
export const ALICE = new Uint8Array(32).fill(1);
export const BOB = new Uint8Array(32).fill(2);
export const RELAY_KEY = new Uint8Array(32).fill(3);
export const TEST_CHANNEL = "11111111-2222-4333-8444-555555555555";
export const FINGERPRINT = "a".repeat(64);

export function message(
  channel,
  timestamp,
  parent = null,
  root = parent,
  key = ALICE,
) {
  const tags = [["h", channel]];
  if (parent) {
    if (root !== parent) tags.push(["e", root.id, "", "root"]);
    tags.push(["e", parent.id, "", "reply"]);
  }
  return finalizeEvent(
    {
      kind: 9,
      created_at: timestamp,
      tags,
      content: `SYNTHETIC SOURCE BODY ${timestamp}`,
    },
    key,
  );
}

export function world({ channel = TEST_CHANNEL } = {}) {
  const actor = getPublicKey(ALICE),
    relay = getPublicKey(RELAY_KEY);
  const signed = (kind, tags, key = RELAY_KEY) =>
    finalizeEvent({ kind, created_at: 1, content: "", tags }, key);
  const creator = signed(
    9007,
    [["h", channel], ["name", "Synthetic thread test"], ["private"]],
    ALICE,
  );
  let clock = 10000;
  let registration =
    channel === DM
      ? null
      : {
          version: 1,
          channelId: channel,
          creatorEventId: creator.id,
          ownerPubkey: actor,
          purpose: "thread-link-smoke",
          expiresAt: clock + 3600,
          digest: "e".repeat(64),
        };
  const metadataTags = [
    ["d", channel],
    ["name", "Synthetic thread test"],
    ["private"],
    ["closed"],
    ["t", channel === DM ? "dm" : "stream"],
  ];
  const metadata = new Map([
    [39000, signed(39000, metadataTags)],
    [
      39002,
      signed(39002, [
        ["d", channel],
        ["p", actor, "", "admin"],
        ...(channel === DM ? [["p", JACOB, "", "member"]] : []),
      ]),
    ],
    [
      39001,
      signed(39001, [
        ["d", channel],
        ["p", actor, "admin"],
      ]),
    ],
  ]);
  const root = message(channel, 10),
    child = message(channel, 11);
  const descendant = message(channel, 12, child);
  const events = new Map(
    [root, child, descendant].map((event) => [event.id, event]),
  );
  const submissions = [],
    requests = [],
    nonces = new Set();
  const hooks = { beforePost: null, afterPost: null, reject: false };
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  async function fakeFetch(url, options) {
    requests.push({ url, options });
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    if (url === `${RELAY}/`) return json({ self: relay });
    assert.ok([`${RELAY}/query`, `${RELAY}/events`].includes(url));
    const auth = JSON.parse(
      Buffer.from(options.headers.Authorization.slice(6), "base64").toString(
        "utf8",
      ),
    );
    assert.equal(verifyEvent(auth), true);
    assert.equal(auth.pubkey, actor);
    assert.deepEqual(
      auth.tags.find(([name]) => name === "u"),
      ["u", url],
    );
    assert.deepEqual(
      auth.tags.find(([name]) => name === "method"),
      ["method", "POST"],
    );
    assert.deepEqual(
      auth.tags.find(([name]) => name === "payload"),
      ["payload", hash(options.body)],
    );
    const nonce = auth.tags.find(([name]) => name === "nonce")[1];
    assert.equal(nonces.has(nonce), false);
    nonces.add(nonce);
    if (url.endsWith("/query")) {
      const [filter] = JSON.parse(options.body);
      if (metadata.has(filter.kinds[0]))
        return json([metadata.get(filter.kinds[0])]);
      const pool = filter.kinds.includes(9007)
        ? [creator]
        : [...events.values()];
      const rows = pool
        .filter(
          (event) =>
            filter.kinds.includes(event.kind) &&
            (!filter.ids || filter.ids.includes(event.id)) &&
            event.created_at >= (filter.since ?? 0) &&
            event.created_at <= (filter.until ?? Number.MAX_SAFE_INTEGER),
        )
        .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
        .slice(0, filter.limit);
      return json(rows);
    }
    const event = JSON.parse(options.body);
    submissions.push(options.body);
    if (hooks.beforePost) await hooks.beforePost(event);
    if (hooks.reject) return json({ event_id: event.id, accepted: false });
    events.set(event.id, event);
    if (hooks.afterPost) await hooks.afterPost(event);
    return json({ event_id: event.id, accepted: true });
  }
  const client = createClient(ALICE, registration, {
    fetchImpl: fakeFetch,
    now: () => clock,
    readRegistration: () => registration,
  });
  return {
    client,
    root,
    child,
    descendant,
    events,
    metadata,
    submissions,
    requests,
    hooks,
    creator,
    actor,
    relay,
    channel,
    advance: (seconds = 1) => {
      clock += seconds;
    },
    replaceRegistration: (value) => {
      registration = value;
    },
    registration: () => registration,
    metadataEvent: (kind, tags) => signed(kind, tags),
  };
}

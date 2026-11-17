import { projectThreadLinks } from "../../desktop/src/features/messages/lib/threadLinkProjection.ts";
import {
  isThreadLinkCandidate,
  parseThreadLink,
} from "../../desktop/src/features/messages/lib/threadLinks.ts";
import {
  DM,
  isHex,
  JACOB,
  RELAY,
  authorizeChannel,
  ensure,
  hash,
  signedEvent,
} from "./thread_link_common.mjs";

function oneTag(event, name) {
  const tags = event.tags.filter((tag) => tag[0] === name);
  ensure(tags.length === 1 && tags[0].length === 2, "ambiguous-channel-state");
  return tags[0][1];
}

async function channelState(client, channel, relayPubkey) {
  const registrationDigest = authorizeChannel(
    channel,
    client.registration,
    client.actorPubkey,
    client.now(),
  );
  const readHead = async (kind) => {
    const rows = await client.query({
      kinds: [kind],
      "#d": [channel],
      limit: 1,
    });
    ensure(rows.length === 1, "missing-channel-state");
    const event = signedEvent(rows[0]);
    ensure(
      event.kind === kind &&
        event.pubkey === relayPubkey &&
        oneTag(event, "d") === channel,
      "unverified-channel-state",
    );
    return event;
  };
  const metadata = await readHead(39000);
  const tags = metadata.tags;
  ensure(
    tags.some((tag) => tag[0] === "private") &&
      !tags.some((tag) => tag[0] === "public"),
    "channel-not-private",
  );
  ensure(
    !tags.some(
      (tag) => tag[0] === "archived" && !["false", "0"].includes(tag[1]),
    ),
    "channel-archived",
  );
  ensure(
    oneTag(metadata, "t") === (channel === DM ? "dm" : "stream"),
    "wrong-channel-type",
  );
  const roster = await readHead(39002);
  const members = roster.tags
    .filter((tag) => tag[0] === "p")
    .map((tag) => {
      ensure(
        tag.length === 4 &&
          isHex(tag[1]) &&
          tag[2] === "" &&
          ["owner", "admin", "member"].includes(tag[3]),
        "invalid-roster",
      );
      return { pubkey: tag[1], role: tag[3] };
    })
    .sort((a, b) => a.pubkey.localeCompare(b.pubkey));
  ensure(
    new Set(members.map((member) => member.pubkey)).size === members.length,
    "invalid-roster",
  );
  const expected =
    channel === DM ? [JACOB, client.actorPubkey].sort() : [client.actorPubkey];
  ensure(
    JSON.stringify(members.map((member) => member.pubkey)) ===
      JSON.stringify(expected),
    "unexpected-channel-members",
  );
  let creatorId = null;
  let adminsId = null;
  if (channel !== DM) {
    const admins = await readHead(39001);
    ensure(
      admins.tags.some(
        (tag) =>
          tag[0] === "p" &&
          tag[1] === client.actorPubkey &&
          ["owner", "admin"].includes(tag[2]),
      ),
      "test-channel-not-owned",
    );
    const rows = await client.query({
      kinds: [9007],
      "#h": [channel],
      ids: [client.registration.creatorEventId],
      limit: 1,
    });
    ensure(rows.length === 1, "missing-channel-creator");
    const creator = signedEvent(rows[0]);
    ensure(
      creator.kind === 9007 &&
        creator.id === client.registration.creatorEventId &&
        creator.pubkey === client.actorPubkey &&
        oneTag(creator, "h") === channel,
      "unverified-channel-creator",
    );
    creatorId = creator.id;
    adminsId = admins.id;
  }
  return {
    registrationDigest,
    metadataId: metadata.id,
    rosterId: roster.id,
    adminsId,
    creatorId,
    members,
  };
}

/** Complete bounded history; a saturated second is an error, never skipped. */
export async function channelHistory(client, channel, until) {
  const events = new Map();
  const pageSize = 200;
  const read = async (since, before) => {
    const rows = await client.query({
      kinds: [9, 40002],
      "#h": [channel],
      since,
      until: before,
      limit: pageSize,
    });
    ensure(
      Array.isArray(rows) && rows.length <= pageSize,
      "invalid-history-page",
    );
    for (const row of rows) {
      const event = signedEvent(row);
      ensure(
        [9, 40002].includes(event.kind) &&
          oneTag(event, "h") === channel &&
          event.created_at >= since &&
          event.created_at <= before,
        "out-of-scope-history",
      );
      events.set(event.id, event);
      ensure(events.size <= 6000, "history-limit");
    }
    return rows;
  };
  let before = until;
  for (let page = 0; page < 100; page++) {
    const rows = await read(0, before);
    if (rows.length < pageSize) return [...events.values()];
    const oldest = Math.min(...rows.map((row) => row.created_at));
    const boundary = await read(oldest, oldest);
    ensure(boundary.length < pageSize, "history-saturated-second");
    if (oldest === 0) return [...events.values()];
    before = oldest - 1;
  }
  ensure(false, "history-page-limit");
}

export async function snapshot(client, channel) {
  const relayPubkey = await client.info();
  const state = await channelState(client, channel, relayPubkey);
  const scope = {
    communityUrl: RELAY,
    channelId: channel,
    relaySelfPubkey: relayPubkey,
  };
  const events = await channelHistory(client, channel, client.now() + 900);
  const messages = events.filter((event) => !isThreadLinkCandidate(event));
  const annotations = events.filter(isThreadLinkCandidate);
  const messageIds = new Set(messages.map((event) => event.id));
  const validAnnotations = new Map(
    annotations
      .map((event) => [event.id, parseThreadLink(event, scope)])
      .filter(([, parsed]) => parsed.state === "valid"),
  );
  const unavailableEventIds = new Set();
  // The successful complete scope query proves these target/type absences.
  for (const parsed of validAnnotations.values()) {
    const { childId, parentId, previousId } = parsed.annotation;
    for (const id of [childId, parentId])
      if (id && !messageIds.has(id)) unavailableEventIds.add(id);
    if (previousId && !validAnnotations.has(previousId))
      unavailableEventIds.add(previousId);
  }
  const projection = projectThreadLinks({
    scope,
    messages,
    annotations,
    historyComplete: true,
    unavailableEventIds,
  });
  ensure(projection.status === "complete", "incomplete-projection");
  const summary = {
    relayPubkey,
    ...state,
    messageIds: [...messageIds].sort(),
    annotationIds: annotations.map((event) => event.id).sort(),
  };
  return {
    scope,
    messages,
    annotations,
    unavailableEventIds,
    projection,
    summary,
    digest: hash(JSON.stringify(summary)),
  };
}

/** Recompute the reviewed baseline without this journal's already-published IDs. */
export function baselineDigest(current, ownEventIds) {
  return hash(
    JSON.stringify({
      ...current.summary,
      annotationIds: current.summary.annotationIds.filter(
        (id) => !ownEventIds.has(id),
      ),
    }),
  );
}

export async function readAnnotation(client, channel, id) {
  ensure(isHex(id), "invalid-event-id");
  const rows = await client.query({
    kinds: [9],
    "#h": [channel],
    ids: [id],
    limit: 1,
  });
  ensure(rows.length <= 1, "invalid-event-readback");
  if (!rows.length) return null;
  const event = signedEvent(rows[0]);
  ensure(
    event.id === id && oneTag(event, "h") === channel,
    "out-of-scope-readback",
  );
  return event;
}

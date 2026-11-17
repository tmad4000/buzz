import { randomUUID } from "node:crypto";
import fs from "node:fs";

import {
  parseThreadLink,
  THREAD_LINK_MARKER,
} from "../../desktop/src/features/messages/lib/threadLinks.ts";
import {
  CONTENT,
  DM,
  isHex,
  KEY_FILE,
  PASEO,
  RELAY,
  SCOPE_FILE,
  authorizeChannel,
  ensure,
  exactKeys,
  fail,
  finalizeEvent,
  getPublicKey,
  hash,
} from "./thread_link_common.mjs";

export function privateBytes(file, maximum) {
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const stat = fs.fstatSync(fd);
    ensure(
      stat.isFile() &&
        stat.uid === process.getuid() &&
        stat.nlink === 1 &&
        (stat.mode & 0o777) === 0o600 &&
        stat.size <= maximum,
      "private-file-policy",
    );
    const data = Buffer.alloc(maximum + 1);
    let size = 0;
    while (size < data.length) {
      const read = fs.readSync(fd, data, size, data.length - size, null);
      if (read === 0) break;
      size += read;
    }
    ensure(size <= maximum, "private-file-bound");
    return data.subarray(0, size);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function loadPaseoKey() {
  const text = privateBytes(KEY_FILE, 128).toString("utf8").trim();
  ensure(isHex(text), "invalid-local-identity");
  const key = Uint8Array.from(Buffer.from(text, "hex"));
  ensure(getPublicKey(key) === PASEO, "wrong-local-identity");
  return key;
}

export function validateRegistration(bytes, channel, actor, now) {
  let data;
  try {
    data = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("invalid-scope-registration");
  }
  ensure(
    data &&
      Object.keys(data).sort().join(",") ===
        [
          "channelId",
          "creatorEventId",
          "expiresAt",
          "ownerPubkey",
          "purpose",
          "version",
        ]
          .sort()
          .join(","),
    "invalid-scope-registration",
  );
  ensure(
    data.ownerPubkey === actor &&
      Number.isSafeInteger(data.expiresAt) &&
      data.expiresAt <= now + 7 * 86400,
    "invalid-scope-registration",
  );
  const registration = { ...data, digest: hash(bytes) };
  authorizeChannel(channel, registration, actor, now);
  return registration;
}

export function loadRegistration(channel, now) {
  if (channel === DM) return null;
  return validateRegistration(
    privateBytes(SCOPE_FILE, 4096),
    channel,
    PASEO,
    now,
  );
}

function filterChannel(filter) {
  const keys = Object.keys(filter);
  ensure(
    keys.every((key) =>
      ["kinds", "#h", "#d", "ids", "since", "until", "limit"].includes(key),
    ),
    "query-not-allowlisted",
  );
  ensure(
    Number.isSafeInteger(filter.limit) &&
      filter.limit >= 1 &&
      filter.limit <= 200,
    "query-not-allowlisted",
  );
  const kinds = filter.kinds;
  ensure(Array.isArray(kinds) && kinds.length > 0, "query-not-allowlisted");
  const metadata =
    kinds.length === 1 && [39000, 39001, 39002].includes(kinds[0]);
  const scoped = metadata ? filter["#d"] : filter["#h"];
  ensure(Array.isArray(scoped) && scoped.length === 1, "query-not-allowlisted");
  if (metadata) {
    ensure(keys.length === 3 && filter.limit === 1, "query-not-allowlisted");
  } else {
    ensure(
      !filter["#d"] &&
        kinds.every((kind) => [9, 40002, 9007].includes(kind)) &&
        new Set(kinds).size === kinds.length,
      "query-not-allowlisted",
    );
    if (kinds.includes(9007))
      ensure(
        kinds.length === 1 && filter.ids?.length === 1,
        "query-not-allowlisted",
      );
    if (filter.ids !== undefined)
      ensure(
        Array.isArray(filter.ids) &&
          filter.ids.length >= 1 &&
          filter.ids.length <= 200 &&
          filter.ids.every((id) => isHex(id)),
        "query-not-allowlisted",
      );
    for (const key of ["since", "until"])
      if (filter[key] !== undefined)
        ensure(
          Number.isSafeInteger(filter[key]) && filter[key] >= 0,
          "query-not-allowlisted",
        );
  }
  return scoped[0];
}

async function responseJson(response, maximum) {
  const chunks = [];
  let size = 0;
  ensure(response.body, "empty-response");
  for await (const chunk of response.body) {
    size += chunk.length;
    ensure(size <= maximum, "response-bound");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail("invalid-response");
  }
}

/** The production entrypoint supplies only its fixed local key and registration. */
export function createClient(
  key,
  registration,
  {
    fetchImpl = fetch,
    now = () => Math.floor(Date.now() / 1000),
    readRegistration = loadRegistration,
  } = {},
) {
  const actorPubkey = getPublicKey(key);
  const capturedRegistration = registration
    ? Object.freeze({ ...registration })
    : null;
  const startedAt = performance.now();
  let requests = 0;
  const budget = () =>
    ensure(
      ++requests <= 400 && performance.now() - startedAt <= 600000,
      "operation-budget-exhausted",
    );
  const allowed = (channel) => {
    const current = readRegistration(channel, now());
    ensure(
      (current?.digest ?? null) === (capturedRegistration?.digest ?? null),
      "scope-registration-changed",
    );
    return authorizeChannel(channel, current, actorPubkey, now());
  };
  async function post(endpoint, body) {
    ensure(
      endpoint === "/query" || endpoint === "/events",
      "endpoint-not-allowlisted",
    );
    budget();
    const url = RELAY + endpoint;
    const auth = finalizeEvent(
      {
        kind: 27235,
        created_at: now(),
        content: "",
        tags: [
          ["u", url],
          ["method", "POST"],
          ["nonce", randomUUID()],
          ["payload", hash(body)],
        ],
      },
      key,
    );
    const response = await fetchImpl(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Nostr ${Buffer.from(JSON.stringify(auth)).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body,
    });
    ensure(
      response.ok,
      endpoint === "/events" ? "submit-uncertain" : "query-failed",
    );
    return responseJson(
      response,
      endpoint === "/events" ? 4096 : 16 * 1024 * 1024,
    );
  }
  return {
    actorPubkey,
    registration: capturedRegistration,
    now,
    async info() {
      budget();
      const response = await fetchImpl(`${RELAY}/`, {
        headers: { Accept: "application/nostr+json" },
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      });
      ensure(response.ok, "relay-info-failed");
      const data = await responseJson(response, 65536);
      ensure(isHex(data?.self ?? ""), "missing-relay-identity");
      return data.self;
    },
    async query(filter) {
      const channel = filterChannel(filter);
      allowed(channel);
      const rows = await post("/query", JSON.stringify([filter]));
      ensure(
        Array.isArray(rows) && rows.length <= filter.limit,
        "invalid-query-response",
      );
      return rows;
    },
    signAnnotation(channel, operation, timestamp) {
      allowed(channel);
      ensure(
        Number.isSafeInteger(timestamp) && Math.abs(timestamp - now()) <= 900,
        "invalid-annotation-time",
      );
      ensure(
        ["link", "unlink"].includes(operation.operation) &&
          isHex(operation.childEventId) &&
          (operation.expectedHead === null || isHex(operation.expectedHead)),
        "invalid-annotation",
      );
      ensure(
        operation.operation === "link"
          ? isHex(operation.parentEventId) &&
              operation.parentEventId !== operation.childEventId
          : operation.parentEventId === null,
        "invalid-annotation",
      );
      const tags = [
        ["h", channel],
        ["t", THREAD_LINK_MARKER],
        ["buzz-thread-op", operation.operation],
        ["buzz-thread-child", operation.childEventId],
        ["buzz-thread-previous", operation.expectedHead ?? "none"],
      ];
      if (operation.operation === "link")
        tags.push(["buzz-thread-parent", operation.parentEventId]);
      const event = finalizeEvent(
        { kind: 9, created_at: timestamp, content: CONTENT, tags },
        key,
      );
      ensure(
        parseThreadLink(event, { communityUrl: RELAY, channelId: channel })
          .state === "valid",
        "invalid-annotation",
      );
      return JSON.stringify(event);
    },
    async submit(bytes) {
      ensure(
        typeof bytes === "string" && bytes.length <= 4096,
        "invalid-annotation",
      );
      let event;
      try {
        event = JSON.parse(bytes);
      } catch {
        fail("invalid-annotation");
      }
      exactKeys(event, [
        "id",
        "pubkey",
        "created_at",
        "kind",
        "content",
        "tags",
        "sig",
      ]);
      ensure(
        JSON.stringify(event) === bytes && Array.isArray(event.tags),
        "noncanonical-annotation-bytes",
      );
      const channel = event.tags.find(
        (tag) => Array.isArray(tag) && tag[0] === "h",
      )?.[1];
      allowed(channel);
      ensure(
        event.content === CONTENT &&
          event.pubkey === actorPubkey &&
          parseThreadLink(event, { communityUrl: RELAY, channelId: channel })
            .state === "valid",
        "invalid-annotation",
      );
      const reply = await post("/events", bytes);
      ensure(
        reply?.event_id === event.id && typeof reply.accepted === "boolean",
        "submit-uncertain",
      );
      return { eventId: event.id, accepted: reply.accepted };
    },
  };
}

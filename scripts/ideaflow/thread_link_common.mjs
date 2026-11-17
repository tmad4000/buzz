import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../../desktop/package.json", import.meta.url),
);
export const {
  finalizeEvent,
  getPublicKey,
  verifyEvent,
} = require("nostr-tools/pure");
export const RELAY = "https://jprojects.communities.buzz.xyz";
export const DM = "ad66b837-7232-4fa0-b41f-cbc49d415b0b";
export const PASEO =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
export const JACOB =
  "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
export const KEY_FILE =
  "/home/dev/code/paseo-buzz-bridge-20261114/identity/private-key";
export const SCOPE_FILE =
  "/home/dev/code/buzz-worklog-20261116/thread-link-smoke-scope.json";
export const CONTENT =
  "Thread organization: one prior message reorganized. Original signed messages unchanged.";
export const HEX = /^[0-9a-f]{64}$/;
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export class ThreadLinkError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
export function isHex(value) {
  return typeof value === "string" && HEX.test(value);
}
export function fail(code) {
  throw new ThreadLinkError(code);
}
export function ensure(condition, code) {
  if (!condition) fail(code);
}
export function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
export function exactKeys(value, required, optional = []) {
  ensure(
    value && typeof value === "object" && !Array.isArray(value),
    "invalid-schema",
  );
  const keys = Object.keys(value);
  ensure(
    required.every((key) => keys.includes(key)) &&
      keys.every((key) => [...required, ...optional].includes(key)),
    "invalid-schema",
  );
}
export function authorizeChannel(channel, registration, actor, now) {
  ensure(typeof channel === "string" && UUID.test(channel), "invalid-channel");
  if (channel === DM) return null;
  ensure(
    registration?.version === 1 &&
      registration.channelId === channel &&
      registration.ownerPubkey === actor &&
      registration.purpose === "thread-link-smoke" &&
      isHex(registration.creatorEventId) &&
      isHex(registration.digest) &&
      registration.expiresAt > now,
    "channel-not-allowlisted",
  );
  return registration.digest;
}
export function signedEvent(value) {
  ensure(
    value &&
      typeof value === "object" &&
      isHex(value.id ?? "") &&
      isHex(value.pubkey ?? "") &&
      typeof value.sig === "string" &&
      /^[0-9a-f]{128}$/.test(value.sig) &&
      Number.isSafeInteger(value.created_at) &&
      value.created_at >= 0 &&
      Number.isSafeInteger(value.kind) &&
      value.kind >= 0 &&
      value.kind <= 65535 &&
      typeof value.content === "string" &&
      value.content.length <= 262144 &&
      Array.isArray(value.tags) &&
      value.tags.length <= 128,
    "invalid-signed-event",
  );
  let characters = 0;
  for (const tag of value.tags) {
    ensure(
      Array.isArray(tag) && tag.length > 0 && tag.length <= 16,
      "invalid-signed-event",
    );
    for (const part of tag) {
      ensure(typeof part === "string", "invalid-signed-event");
      characters += part.length;
    }
  }
  ensure(characters <= 16384, "invalid-signed-event");
  const event = Object.fromEntries(
    ["id", "pubkey", "created_at", "kind", "tags", "content", "sig"].map(
      (key) => [
        key,
        key === "tags" ? value.tags.map((tag) => [...tag]) : value[key],
      ],
    ),
  );
  let verified = false;
  try {
    verified = verifyEvent(event);
  } catch {
    /* invalid key/signature */
  }
  ensure(verified, "invalid-signed-event");
  return event;
}

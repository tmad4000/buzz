import { verifyEvent } from "nostr-tools/pure";
import type { RelayEvent } from "@/shared/api/types";
export const QUEUE_RELAY = "https://jprojects.communities.buzz.xyz";
export const QUEUE_BRIDGE =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
export const QUEUE_RECIPIENT =
  "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
export const QUEUE_D = "agent-queue-v1";
export const QUEUE_SERVER = "srv_KIFHQ_zsBnI2";
export const QUEUE_ROOT = "d3caa262-cdcd-454d-9d42-0cd05ac69156";
export const PREVIEWS = {
  "jacob-dm": "Jacob DM request",
  "jacob-p2": "Jacob P2 request",
  watchdog: "Automatic reminder",
  agent: "Agent update",
  unknown: "Queued item (source unavailable)",
} as const;
export type QueueRow = {
  id: string;
  source: keyof typeof PREVIEWS;
  createdAt: number;
  preview: string;
  state: "queued" | "delivered";
  stateObservedAt: number;
};
export type QueueSnapshot = {
  v: 1;
  serverId: typeof QUEUE_SERVER;
  agentId: typeof QUEUE_ROOT;
  observedAt: number;
  verifiedAt: number | null;
  availability: "ok" | "unavailable";
  rootState: "running" | "idle" | "unknown";
  depth: number | null;
  oldestCreatedAt: number | null;
  items: QueueRow[];
  recent: QueueRow[];
  omitted: number;
  complete: boolean;
};
const fields = [
  "v",
  "serverId",
  "agentId",
  "observedAt",
  "verifiedAt",
  "availability",
  "rootState",
  "depth",
  "oldestCreatedAt",
  "items",
  "recent",
  "omitted",
  "complete",
];
const rowFields = [
  "id",
  "source",
  "createdAt",
  "preview",
  "state",
  "stateObservedAt",
];
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const time = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0;
export const queueFilter = () => ({
  kinds: [30078],
  authors: [QUEUE_BRIDGE],
  "#d": [QUEUE_D],
  "#p": [QUEUE_RECIPIENT],
  limit: 1,
});
/** Only authenticated siblings enter the replacement watermark. Foreign/unsigned noise cannot erase it. */
export function authenticatedSibling(e: RelayEvent, _now: number): boolean {
  if (
    !e ||
    !Array.isArray(e.tags) ||
    e.tags.length > 16 ||
    !e.tags.every(
      (t) =>
        Array.isArray(t) &&
        t.length <= 8 &&
        t.every((v) => typeof v === "string" && v.length <= 256),
    ) ||
    typeof e.content !== "string" ||
    e.content.length > 32768 ||
    typeof e.sig !== "string" ||
    typeof e.id !== "string" ||
    !/^[a-f0-9]{64}$/.test(e.id) ||
    !/^[a-f0-9]{128}$/.test(e.sig) ||
    e.kind !== 30078 ||
    e.pubkey !== QUEUE_BRIDGE ||
    !time(e.created_at) ||
    !e.tags.some((t) => t[0] === "d" && t[1] === QUEUE_D)
  )
    return false;
  try {
    return verifyEvent({
      id: e.id,
      pubkey: e.pubkey,
      kind: e.kind,
      created_at: e.created_at,
      tags: e.tags,
      content: e.content,
      sig: e.sig,
    });
  } catch {
    return false;
  }
}
export function validEnvelope(
  e: RelayEvent,
  now = Math.floor(Date.now() / 1000),
): boolean {
  if (e.created_at > now + 60) return false;
  if (e.content.length > 24576) return false;
  let version = false;
  try {
    version = atob(e.content).charCodeAt(0) === 2;
  } catch {}
  return (
    version &&
    JSON.stringify(e.tags) ===
      JSON.stringify([
        ["d", QUEUE_D],
        ["p", QUEUE_RECIPIENT],
      ]) &&
    e.content.length <= 24576 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(e.content)
  );
}
export const newer = (a: RelayEvent, b: RelayEvent) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);
/** Strict second validation after native decrypt. Never persists or logs decoded content. */
export function parseQueue(
  input: unknown,
  eventCreatedAt: number,
): QueueSnapshot {
  if (
    new TextEncoder().encode(JSON.stringify(input)).length > 16384 ||
    !object(input) ||
    !exact(input, fields)
  )
    throw new Error("Invalid private queue snapshot");
  const q = input;
  if (
    q.v !== 1 ||
    q.serverId !== QUEUE_SERVER ||
    q.agentId !== QUEUE_ROOT ||
    !time(q.observedAt) ||
    q.observedAt > eventCreatedAt + 60 ||
    !(
      q.verifiedAt === null ||
      (time(q.verifiedAt) && q.verifiedAt <= q.observedAt)
    ) ||
    !["running", "idle", "unknown"].includes(String(q.rootState)) ||
    !Array.isArray(q.items) ||
    q.items.length > 64 ||
    !Array.isArray(q.recent) ||
    q.recent.length > 10 ||
    !time(q.omitted) ||
    typeof q.complete !== "boolean"
  )
    throw new Error("Invalid private queue snapshot");
  const ids = new Set<string>();
  for (const [rows, state] of [
    [q.items, "queued"],
    [q.recent, "delivered"],
  ] as const)
    for (const r of rows) {
      if (
        !object(r) ||
        !exact(r, rowFields) ||
        typeof r.id !== "string" ||
        !/^[a-f0-9]{64}$/.test(r.id) ||
        ids.has(r.id) ||
        !Object.hasOwn(PREVIEWS, String(r.source)) ||
        r.preview !== PREVIEWS[r.source as keyof typeof PREVIEWS] ||
        r.state !== state ||
        !time(r.createdAt) ||
        !time(r.stateObservedAt) ||
        r.createdAt > q.observedAt + 60 ||
        r.stateObservedAt > q.observedAt + 60 ||
        r.stateObservedAt < r.createdAt
      )
        throw new Error("Invalid private queue snapshot");
      ids.add(r.id);
    }
  if (q.availability === "unavailable") {
    if (
      q.rootState !== "unknown" ||
      q.depth !== null ||
      q.oldestCreatedAt !== null ||
      q.items.length ||
      q.recent.length ||
      q.omitted !== 0 ||
      q.complete !== false
    )
      throw new Error("Invalid private queue snapshot");
  } else if (
    q.availability !== "ok" ||
    q.verifiedAt !== q.observedAt ||
    !time(q.depth) ||
    q.depth > 1000 ||
    q.items.length > q.depth ||
    q.omitted !== q.depth - q.items.length ||
    q.complete !== (q.omitted === 0) ||
    (q.depth === 0
      ? q.oldestCreatedAt !== null
      : !time(q.oldestCreatedAt) ||
        q.oldestCreatedAt > q.observedAt + 60 ||
        q.items.some((r) => (q.oldestCreatedAt as number) > r.createdAt))
  )
    throw new Error("Invalid private queue snapshot");
  return q as QueueSnapshot;
}
export function queueAge(q: QueueSnapshot, now: number) {
  const seconds =
    q.verifiedAt === null ? null : Math.max(0, now - q.verifiedAt);
  return { seconds, stale: seconds === null || seconds > 120 };
}

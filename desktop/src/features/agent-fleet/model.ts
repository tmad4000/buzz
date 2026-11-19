import { verifyEvent } from "nostr-tools/pure";
import type { RelayEvent } from "@/shared/api/types";
import {
  QUEUE_RELAY,
  QUEUE_BRIDGE,
  QUEUE_RECIPIENT,
  QUEUE_SERVER,
  QUEUE_ROOT,
} from "@/features/agent-queue/model";
export const FLEET_RELAY = QUEUE_RELAY,
  FLEET_BRIDGE = QUEUE_BRIDGE,
  FLEET_RECIPIENT = QUEUE_RECIPIENT,
  FLEET_SERVER = QUEUE_SERVER,
  FLEET_ROOT = QUEUE_ROOT;
export const FLEET_D = "fleet-status-v1";
export const BUCKETS = [
  "running",
  "idle",
  "blocked",
  "needsPermission",
  "unknown",
] as const;
export type FleetCounts = Record<(typeof BUCKETS)[number], number | null>;
export type FleetQueue = {
  availability: "ok" | "unavailable";
  depth: number | null;
  observedAt: number | null;
  verifiedAt: number | null;
  sourceEventId: string | null;
};
export type FleetSnapshot = {
  v: 1;
  serverId: typeof FLEET_SERVER;
  observedAt: number;
  verifiedAt: number | null;
  availability: "ok" | "partial" | "unavailable";
  coverage: { seen: number; total: number | null; complete: boolean };
  gcp: FleetCounts;
  root: {
    agentId: typeof FLEET_ROOT;
    state: "running" | "idle" | "blocked" | "needs-permission" | "unknown";
    queue: FleetQueue;
  };
  otherHosts: { m4: "unknown"; m5: "unknown" };
};
export const fleetFilter = () => ({
  kinds: [30078],
  authors: [FLEET_BRIDGE],
  "#d": [FLEET_D],
  "#p": [FLEET_RECIPIENT],
  limit: 1,
});
const time = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 253402300799;
const count = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10000;
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const exact = (
  v: unknown,
  keys: readonly string[],
): v is Record<string, unknown> =>
  obj(v) &&
  Object.keys(v).length === keys.length &&
  keys.every((k) => Object.hasOwn(v, k));
const bad = (): never => {
  throw new Error("Private fleet unavailable");
};
/** Frame budgets are checked before signature work. Unauthenticated noise never owns the watermark. */
export function authenticatedFleet(e: RelayEvent, _now: number): boolean {
  if (
    !e ||
    e.kind !== 30078 ||
    e.pubkey !== FLEET_BRIDGE ||
    !time(e.created_at) ||
    typeof e.content !== "string" ||
    e.content.length > 12288 ||
    typeof e.id !== "string" ||
    !/^[a-f0-9]{64}$/.test(e.id) ||
    typeof e.sig !== "string" ||
    !/^[a-f0-9]{128}$/.test(e.sig) ||
    !Array.isArray(e.tags) ||
    e.tags.length > 16 ||
    !e.tags.every(
      (t) =>
        Array.isArray(t) &&
        t.length <= 8 &&
        t.every((s) => typeof s === "string" && s.length <= 256),
    ) ||
    !e.tags.some((t) => t[0] === "d" && t[1] === FLEET_D)
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
export const newerFleet = (a: RelayEvent, b: RelayEvent) =>
  a.created_at > b.created_at || (a.created_at === b.created_at && a.id < b.id);
export function fleetEnvelope(e: RelayEvent, now: number) {
  if (
    e.created_at > now + 60 ||
    e.content.length > 8192 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(e.content) ||
    JSON.stringify(e.tags) !==
      JSON.stringify([
        ["d", FLEET_D],
        ["p", FLEET_RECIPIENT],
      ])
  )
    return false;
  try {
    return atob(e.content).charCodeAt(0) === 2;
  } catch {
    return false;
  }
}
/** Second validation after narrow native decrypt, against frozen f8ed wire bytes. */
export function parseFleet(
  input: unknown,
  eventCreatedAt: number,
): FleetSnapshot {
  if (
    new TextEncoder().encode(JSON.stringify(input)).length > 4096 ||
    !exact(input, [
      "v",
      "serverId",
      "observedAt",
      "verifiedAt",
      "availability",
      "coverage",
      "gcp",
      "root",
      "otherHosts",
    ])
  )
    return bad();
  const q = input;
  if (
    q.v !== 1 ||
    q.serverId !== FLEET_SERVER ||
    !time(q.observedAt) ||
    q.observedAt > eventCreatedAt + 60 ||
    !(
      q.verifiedAt === null ||
      (time(q.verifiedAt) && q.verifiedAt <= q.observedAt)
    ) ||
    !exact(q.coverage, ["seen", "total", "complete"]) ||
    !exact(q.gcp, BUCKETS) ||
    !exact(q.root, ["agentId", "state", "queue"]) ||
    q.root.agentId !== FLEET_ROOT ||
    !["running", "idle", "blocked", "needs-permission", "unknown"].includes(
      String(q.root.state),
    ) ||
    !exact(q.otherHosts, ["m4", "m5"]) ||
    q.otherHosts.m4 !== "unknown" ||
    q.otherHosts.m5 !== "unknown"
  )
    return bad();
  const c = q.coverage,
    g = q.gcp,
    r = q.root;
  if (
    !count(c.seen) ||
    typeof c.complete !== "boolean" ||
    !(c.total === null || count(c.total)) ||
    !exact(r.queue, [
      "availability",
      "depth",
      "observedAt",
      "verifiedAt",
      "sourceEventId",
    ])
  )
    return bad();
  const queue = r.queue;
  if (queue.sourceEventId === null) {
    if (queue.observedAt !== null || queue.verifiedAt !== null) return bad();
  } else if (
    typeof queue.sourceEventId !== "string" ||
    !/^[a-f0-9]{64}$/.test(queue.sourceEventId) ||
    !time(queue.observedAt) ||
    queue.observedAt > q.observedAt + 60 ||
    !(
      queue.verifiedAt === null ||
      (time(queue.verifiedAt) && queue.verifiedAt <= queue.observedAt)
    )
  )
    return bad();
  if (queue.availability === "ok") {
    if (
      !count(queue.depth) ||
      queue.depth > 1000 ||
      !time(queue.observedAt) ||
      queue.verifiedAt !== queue.observedAt ||
      queue.sourceEventId === null ||
      Math.max(0, q.observedAt - queue.observedAt) > 120
    )
      return bad();
  } else if (queue.availability !== "unavailable" || queue.depth !== null)
    return bad();
  if (q.availability === "unavailable") {
    if (
      c.seen !== 0 ||
      c.total !== null ||
      c.complete !== false ||
      BUCKETS.some((k) => g[k] !== null) ||
      r.state !== "unknown" ||
      queue.availability !== "unavailable" ||
      queue.sourceEventId !== null ||
      queue.observedAt !== null ||
      queue.verifiedAt !== null
    )
      return bad();
  } else {
    if (
      q.verifiedAt !== q.observedAt ||
      BUCKETS.some((k) => !count(g[k])) ||
      BUCKETS.reduce((sum, k) => sum + Number(g[k]), 0) !== c.seen
    )
      return bad();
    if (q.availability === "ok") {
      if (!c.complete || c.total !== c.seen) return bad();
      if (
        r.state !== "unknown" &&
        Number(
          g[
            r.state === "needs-permission" ? "needsPermission" : String(r.state)
          ],
        ) < 1
      )
        return bad();
    } else if (
      q.availability !== "partial" ||
      c.complete ||
      c.total !== null ||
      c.seen > 9999
    )
      return bad();
  }
  return q as FleetSnapshot;
}

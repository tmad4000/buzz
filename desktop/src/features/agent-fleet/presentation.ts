/** UI projection only. The encrypted wire schema is agreed separately with the producer. */
export type FleetObservation = {
  availability: "ok" | "partial" | "unavailable";
  observedAt?: number;
  complete?: boolean;
  verifiedAt: number | null;
  counts?: {
    running: number;
    idle: number;
    blocked: number;
    needsPermission: number;
    unknown: number;
  };
  root?: {
    state: "running" | "idle" | "blocked" | "needs-permission" | "unknown";
    stateVerifiedAt: number | null;
    queueDepth: number | null;
    queueVerifiedAt: number | null;
  };
};
const fresh = (verifiedAt: number | null, now: number) =>
  verifiedAt !== null && Math.max(0, now - verifiedAt) <= 120;
export function fleetPresentation(
  observation: FleetObservation | undefined,
  now: number,
) {
  const unavailable =
    !observation || observation.availability === "unavailable";
  const stale =
    !!observation &&
    observation.verifiedAt !== null &&
    !fresh(observation.verifiedAt, now);
  if (unavailable || stale || !observation.counts) {
    return {
      tone: "unknown" as const,
      pulse: false,
      label:
        observation?.availability === "unavailable"
          ? `GCP agent status unavailable${stale ? " · stale" : ""}`
          : stale
            ? "GCP agent status stale"
            : "GCP agent status unknown",
      detail: "M4/M5 unknown",
      verifiedAt: observation?.verifiedAt ?? null,
    };
  }
  const counts = observation.counts;
  const partial = observation.availability === "partial";
  const root = observation.root;
  const rootState =
    root && fresh(root.stateVerifiedAt, now) ? root.state : "unknown";
  const warning =
    counts.blocked > 0 ||
    counts.needsPermission > 0 ||
    rootState === "blocked" ||
    rootState === "needs-permission";
  const rootLabel = {
    running: "root busy",
    idle: "root idle",
    blocked: "root blocked",
    "needs-permission": "root awaiting permission",
    unknown: "root state unknown",
  }[rootState];
  const queueLabel =
    root && root.queueDepth !== null && fresh(root.queueVerifiedAt, now)
      ? `${root.queueDepth} queued`
      : "queue unknown";
  const parts = [
    partial
      ? `GCP: at least ${counts.running} observed working · partial`
      : `GCP: ${counts.running} ${counts.unknown > 0 ? "confirmed working" : "agents working"}`,
    rootLabel,
    queueLabel,
  ];
  if (counts.needsPermission)
    parts.push(`${counts.needsPermission} awaiting permission`);
  if (counts.blocked) parts.push(`${counts.blocked} blocked`);
  if (counts.unknown) parts.push(`${counts.unknown} states unknown`);
  return {
    tone: warning
      ? ("attention" as const)
      : counts.running > 0 || rootState === "running"
        ? ("working" as const)
        : counts.unknown > 0 || partial
          ? ("unknown" as const)
          : ("idle" as const),
    pulse: (counts.running > 0 || rootState === "running") && !warning,
    label: parts.join(" · "),
    detail: "M4/M5 unknown",
    verifiedAt: observation.verifiedAt,
  };
}

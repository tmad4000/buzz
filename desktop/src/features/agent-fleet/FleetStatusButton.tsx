import { useProfilePanel } from "@/shared/context/ProfilePanelContext";
import { toast } from "sonner";
import { FLEET_BRIDGE, type FleetSnapshot } from "./model";
import { GlobalFleetIndicator } from "./GlobalFleetIndicator";
import { setFleetEnabled } from "./preference";
import { useFleetStatus } from "./useFleetStatus";
import type { FleetObservation } from "./presentation";
export function fleetObservation(q: FleetSnapshot): FleetObservation {
  const available = q.availability !== "unavailable";
  return {
    availability: q.availability,
    observedAt: q.observedAt,
    verifiedAt: q.verifiedAt,
    complete: q.coverage.complete,
    counts: available
      ? {
          running: Number(q.gcp.running),
          idle: Number(q.gcp.idle),
          blocked: Number(q.gcp.blocked),
          needsPermission: Number(q.gcp.needsPermission),
          unknown: Number(q.gcp.unknown),
        }
      : undefined,
    root: available
      ? {
          state: q.root.state,
          stateVerifiedAt: q.verifiedAt,
          queueDepth:
            q.root.queue.availability === "ok" ? q.root.queue.depth : null,
          queueVerifiedAt: q.root.queue.verifiedAt,
        }
      : undefined,
  };
}
export function FleetStatusButton({
  onOpenAgents,
}: {
  onOpenAgents: () => void;
}) {
  const { allowed, enabled, view } = useFleetStatus();
  const { openProfilePanel } = useProfilePanel();
  if (!allowed || !enabled) return null;
  const observation =
    view.status === "ready" && view.snapshot
      ? fleetObservation(view.snapshot)
      : view.status === "error"
        ? { availability: "unavailable" as const, verifiedAt: null }
        : undefined;
  return (
    <GlobalFleetIndicator
      enabled
      observation={observation}
      onOpenQueue={() => {
        if (openProfilePanel) openProfilePanel(FLEET_BRIDGE);
        else onOpenAgents();
      }}
    />
  );
}
function FleetPreference() {
  const { allowed, enabled, view } = useFleetStatus();
  if (!allowed) return null;
  return (
    <section className="mt-3 border-t pt-3">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            try {
              setFleetEnabled(event.target.checked);
            } catch {
              toast.error("Could not save private fleet preference");
            }
          }}
        />
        Show private GCP fleet indicator (this device)
      </label>
      {enabled && view.status === "ready" && view.snapshot ? (
        <p className="mt-2 text-2xs text-muted-foreground">
          Fleet observed{" "}
          {new Date(view.snapshot.observedAt * 1000).toISOString()} · Last
          successful verification{" "}
          {view.snapshot.verifiedAt === null
            ? "unknown"
            : new Date(view.snapshot.verifiedAt * 1000).toISOString()}
        </p>
      ) : null}
      {enabled ? (
        <p className="mt-1 text-2xs text-muted-foreground">
          GCP loaded sessions only; M4/M5 unknown. Blocked means a
          daemon-reported error, not a task or approval request. This does not
          verify provider progress or presence.
        </p>
      ) : null}
    </section>
  );
}
export function FleetIndicatorPreference({ pubkey }: { pubkey: string }) {
  return pubkey === FLEET_BRIDGE ? <FleetPreference /> : null;
}

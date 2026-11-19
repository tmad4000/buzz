import { useNow } from "@/shared/lib/useNow";
import { fleetPresentation, type FleetObservation } from "./presentation";
/** Presentation seam; the opt-in/private receiver is wired only after the shared contract freezes. */
function EnabledFleetIndicator({
  observation,
  onOpenQueue,
}: {
  observation?: FleetObservation;
  onOpenQueue: () => void;
}) {
  const now = useNow(1000) / 1000;
  const view = fleetPresentation(observation, now);
  const dot =
    view.tone === "working"
      ? "bg-emerald-500"
      : view.tone === "attention"
        ? "bg-amber-500"
        : "bg-muted-foreground";
  return (
    <button
      type="button"
      onClick={onOpenQueue}
      onPointerDown={(event) => event.stopPropagation()}
      aria-label={`${view.label}. ${view.detail}. GCP loaded Paseo sessions only. Open Root queue.`}
      title={`${view.label}. ${view.detail}. GCP loaded Paseo sessions only. M4/M5 unknown. No provider progress or presence guarantee. Last attempted: ${observation?.observedAt === undefined ? "unknown" : new Date(observation.observedAt * 1000).toISOString()}`}
      className="mt-2 flex w-full items-start gap-2 rounded-md group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 px-2 py-1 text-left text-2xs text-muted-foreground hover:bg-sidebar-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span
        aria-hidden="true"
        className={`mt-1 size-2 shrink-0 rounded-full ${dot} ${view.pulse ? "motion-safe:animate-pulse" : ""}`}
      />
      <span className="min-w-0 group-data-[collapsible=icon]:hidden">
        <span className="block">{view.label}</span>
        <span className="block">{view.detail}</span>
        {view.verifiedAt === null ? (
          <span className="block">Not yet verified</span>
        ) : (
          <span className="block">
            Last verified {new Date(view.verifiedAt * 1000).toISOString()}
          </span>
        )}
      </span>
    </button>
  );
}

export function GlobalFleetIndicator({
  enabled,
  observation,
  onOpenQueue,
}: {
  enabled: boolean;
  observation?: FleetObservation;
  onOpenQueue: () => void;
}) {
  return enabled ? (
    <EnabledFleetIndicator
      observation={observation}
      onOpenQueue={onOpenQueue}
    />
  ) : null;
}

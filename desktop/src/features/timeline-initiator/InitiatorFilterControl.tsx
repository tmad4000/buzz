import { getPlatformKeysById } from "@/shared/lib/keyboard-shortcuts";
import { INITIATOR_FILTERS, type InitiatorFilter } from "./model";

const labels: Record<InitiatorFilter, string> = {
  all: "All",
  mine: "Mine",
  agents: "Agents",
};

export function InitiatorFilterControl({
  value,
  onChange,
}: {
  value: InitiatorFilter;
  onChange: (filter: InitiatorFilter) => void;
}) {
  const shortcut = getPlatformKeysById("cycle-timeline-initiator");
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
      <span>Started by</span>
      <select
        aria-label="Timeline initiator"
        className="min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        title={shortcut ? `Cycle Timeline initiator (${shortcut})` : undefined}
        value={value}
        onChange={(event) => {
          const filter = INITIATOR_FILTERS.find(
            (item) => item === event.currentTarget.value,
          );
          if (filter) onChange(filter);
        }}
      >
        {INITIATOR_FILTERS.map((filter) => (
          <option key={filter} value={filter}>
            {labels[filter]}
          </option>
        ))}
      </select>
    </label>
  );
}

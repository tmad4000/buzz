import { Button } from "@/shared/ui/button";

export const CHANNEL_PRESENTATION_FEATURE = "lanes";

const labels = { timeline: "Timeline", results: "Results", lanes: "Lanes" };

export type ChannelPresentation = keyof typeof labels;

/** Presentation is independent of the existing timeline's ordering preference. */
export function ChannelPresentationSwitch({
  available,
  selected,
  resultCount,
  onSelect,
  compact = false,
}: {
  available: readonly ChannelPresentation[];
  selected: ChannelPresentation;
  resultCount: number;
  compact?: boolean;
  onSelect: (presentation: ChannelPresentation) => void;
}) {
  if (compact) {
    return (
      <select
        aria-label="Channel view"
        className="min-w-0 max-w-24 rounded-lg border border-border bg-background px-1 py-1 text-xs font-medium text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        value={selected}
        onChange={(event) => {
          const next = available.find(
            (value) => value === event.currentTarget.value,
          );
          if (next) onSelect(next);
        }}
      >
        {available.map((value) => (
          <option key={value} value={value}>
            {labels[value]}
          </option>
        ))}
      </select>
    );
  }
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-1">
      <legend className="sr-only">Channel view</legend>
      {available.map((presentation) => (
        <Button
          key={presentation}
          type="button"
          size="sm"
          variant={selected === presentation ? "secondary" : "ghost"}
          aria-pressed={selected === presentation}
          onClick={() => onSelect(presentation)}
        >
          {labels[presentation]}
          {presentation === "results" && resultCount > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {resultCount}
            </span>
          ) : null}
        </Button>
      ))}
    </fieldset>
  );
}

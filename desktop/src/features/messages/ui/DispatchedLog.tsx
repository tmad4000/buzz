import type { MainTimelineEntry } from "../lib/threadPanel";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import { Button } from "@/shared/ui/button";
import { DispatchTraceRow } from "./DispatchTraceRow";
import type { TimelineMessage } from "../types";
export function DispatchedLog({
  entries,
  onOpen,
}: {
  entries: readonly MainTimelineEntry[];
  onOpen?: (message: TimelineMessage, sourceId: string) => void;
}) {
  const traces = entries
    .filter((entry) => entry.dispatchTrace)
    .slice()
    .reverse();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-testid="dispatched-log"
        >
          Dispatched{traces.length ? ` (${traces.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-96 w-96 max-w-[calc(100vw-2rem)] overflow-y-auto p-2"
        aria-label="Dispatched messages"
      >
        <p className="px-2 py-1 text-sm font-medium">
          Dispatched · loaded messages
        </p>
        {traces.length ? (
          traces.map((entry) => (
            <DispatchTraceRow
              key={entry.message.id}
              message={entry.message}
              root={entry.dispatchTrace?.root ?? null}
              onOpen={onOpen}
            />
          ))
        ) : (
          <p className="p-2 text-xs text-muted-foreground">
            No dispatched messages loaded.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

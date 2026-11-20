import { BUSY_REPLY_THRESHOLDS } from "../lib/busyThreadSuggestions";
import type { ActiveThreadPreferences } from "../lib/activeThreadsPhase0";
export function ActiveThreadSettings({
  preferences,
  onChange,
}: {
  preferences: ActiveThreadPreferences;
  onChange: (value: ActiveThreadPreferences) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={preferences.enabled}
          onChange={(event) =>
            onChange({ ...preferences, enabled: event.target.checked })
          }
        />
        Automatically show busy threads
      </label>
      <label>
        At least{" "}
        <select
          aria-label="Active thread message threshold"
          className="rounded border border-border bg-background p-1"
          value={preferences.threshold}
          onChange={(event) =>
            onChange({ ...preferences, threshold: Number(event.target.value) })
          }
        >
          {BUSY_REPLY_THRESHOLDS.map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>{" "}
        messages
      </label>
    </div>
  );
}

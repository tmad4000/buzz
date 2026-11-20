import {
  ACTIVITY_BANDS,
  type ActiveThreadRow,
} from "../lib/activeThreadsPhase0";
import {
  MAX_OPEN_THREAD_PINS,
  type OpenThreadPin,
} from "../lib/openThreadPins";

type Props = {
  rows: readonly ActiveThreadRow[];
  pinnedCount: number;
  onOpen: (id: string) => void;
  onKeep: (pin: OpenThreadPin) => void;
  onDismiss: (id: string) => void;
  onRemove: (pin: OpenThreadPin) => void;
};
export function ActiveThreadsPhase0List({
  rows,
  pinnedCount,
  onOpen,
  onKeep,
  onDismiss,
  onRemove,
}: Props) {
  return (
    <div className="max-h-48 space-y-2 overflow-auto">
      {ACTIVITY_BANDS.map((band) => {
        const matches = rows.filter((row) => row.band === band);
        if (!matches.length) return null;
        const list = (
          <ul key={band} className="space-y-1">
            {matches.map((row) => (
              <li key={row.id} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={row.activity === null}
                  title={row.title}
                  className="min-w-0 flex-1 truncate rounded px-1 py-1 text-left disabled:opacity-60"
                  onClick={() => onOpen(row.id)}
                >
                  {row.title || "Untitled thread"}
                  {row.activity === null ? " · Outside loaded history" : ""}
                </button>
                {row.messageCount !== null ? (
                  <span className="text-muted-foreground">
                    {row.messageCount} msgs
                  </span>
                ) : null}
                {row.automatic ? (
                  <>
                    <span
                      className="rounded border border-dashed border-border px-1 text-muted-foreground"
                      title={`Added automatically: ${row.messageCount} messages`}
                    >
                      auto
                    </span>
                    <button
                      type="button"
                      aria-label={`Keep ${row.title} pinned`}
                      disabled={pinnedCount >= MAX_OPEN_THREAD_PINS}
                      onClick={() => onKeep({ id: row.id, title: row.title })}
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      aria-label={`Dismiss busy-thread suggestion: ${row.title}`}
                      onClick={() => onDismiss(row.id)}
                    >
                      Dismiss
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="px-2 py-1"
                    aria-label={`Remove ${row.title} from bar`}
                    onClick={() => onRemove(row)}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        );
        return band === "Older" || band === "Outside loaded history" ? (
          <details key={band}>
            <summary>
              {band} · {matches.length}
            </summary>
            {list}
          </details>
        ) : (
          <div key={band}>
            <h3 className="font-medium text-muted-foreground">
              {band} · {matches.length}
            </h3>
            {list}
          </div>
        );
      })}
    </div>
  );
}

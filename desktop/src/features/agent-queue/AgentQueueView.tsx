import { useNow } from "@/shared/lib/useNow";
import { setQueueEnabled } from "./preference";
import { useAgentQueue } from "./useAgentQueue";
import { queueAge, type QueueSnapshot } from "./model";
import { toast } from "sonner";
function age(seconds: number | null) {
  if (seconds === null) return "not yet verified";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}
const absolute = (seconds: number) => new Date(seconds * 1000).toISOString();
export function queueSummary(q: QueueSnapshot, now: number) {
  const freshness = queueAge(q, now);
  if (q.availability !== "ok")
    return `Queue unavailable · last verified ${age(freshness.seconds)}${freshness.stale ? " · STALE" : ""}`;
  if (freshness.stale)
    return `Queue STALE · last verified ${age(freshness.seconds)}`;
  const state = { running: "Running", idle: "Idle", unknown: "State unknown" }[
    q.rootState
  ];
  return `${state} · ${q.depth} queued${q.oldestCreatedAt === null ? "" : ` · oldest ${age(Math.max(0, now - q.oldestCreatedAt))}`}`;
}
function QueueSummary({ snapshot }: { snapshot: QueueSnapshot }) {
  const now = useNow(1000) / 1000;
  return <span>{queueSummary(snapshot, now)}</span>;
}
export function AgentQueueRow({ pubkey }: { pubkey?: string }) {
  const { allowed, enabled, view } = useAgentQueue(pubkey);
  if (!allowed || !enabled) return null;
  return (
    <span
      data-runtime-route
      className="block max-w-40 whitespace-normal text-2xs leading-tight text-muted-foreground"
      aria-label="Private queue summary"
    >
      {view.status === "ready" && view.snapshot ? (
        <QueueSummary snapshot={view.snapshot} />
      ) : view.status === "error" ? (
        "Queue unavailable"
      ) : (
        "Loading private queue…"
      )}
    </span>
  );
}
function SnapshotDetails({ snapshot: q }: { snapshot: QueueSnapshot }) {
  const now = useNow(1000) / 1000;
  return (
    <>
      <p className="text-xs text-muted-foreground">{queueSummary(q, now)}</p>
      <p className="text-xs text-muted-foreground">
        Last verified queue:{" "}
        {q.verifiedAt === null ? "Never" : absolute(q.verifiedAt)} ·{" "}
        {age(queueAge(q, now).seconds)}
      </p>
      <p className="text-xs text-muted-foreground">
        Latest attempt: {absolute(q.observedAt)}
      </p>
      {q.availability === "ok" && !queueAge(q, now).stale ? (
        <>
          <ul className="max-h-64 overflow-y-auto text-xs">
            {q.items.map((row) => (
              <li key={row.id} className="py-1">
                {row.preview} · {age(Math.max(0, now - row.createdAt))} · Queued
              </li>
            ))}
          </ul>
          {q.omitted > 0 ? (
            <p className="text-xs">{q.omitted} more queued rows omitted.</p>
          ) : null}
          {q.recent.length ? (
            <details className="mt-2 text-xs">
              <summary>
                Recently submitted to provider ({q.recent.length})
              </summary>
              <p>
                Provider submission only; not answered or done. Times are first
                observed receipts.
              </p>
              <ul>
                {q.recent.map((row) => (
                  <li key={row.id} className="py-1">
                    {row.preview} · First observed{" "}
                    {absolute(row.stateObservedAt)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}
    </>
  );
}
export function AgentQueuePanel({ pubkey }: { pubkey?: string }) {
  const { allowed, enabled, view } = useAgentQueue(pubkey);
  if (!allowed) return null;
  return (
    <section className="mt-3 border-t pt-3" aria-label="Private Root queue">
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            try {
              setQueueEnabled(event.target.checked);
            } catch {
              toast.error("Could not save private queue preference");
            }
          }}
        />
        Show private queue (this device)
      </label>
      {enabled ? (
        <div className="mt-2">
          <p className="text-xs">
            GCP Root queue · Jacob + Paseo only · Read only
          </p>
          {view.status === "ready" && view.snapshot ? (
            <SnapshotDetails snapshot={view.snapshot} />
          ) : (
            <p role="status" className="text-xs text-muted-foreground">
              {view.status === "error"
                ? "Queue unavailable. Previous projection hidden."
                : "Loading private queue…"}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Host queue only; device outboxes are excluded. Queue status is not
            presence or completion. Updates can be delayed.
          </p>
        </div>
      ) : null}
    </section>
  );
}

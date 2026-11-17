import { OutboxEditor, prepareOutboxEditor } from "./OutboxEditor";
import * as React from "react";
import { toast } from "sonner";
import { OutboxContext } from "./OutboxProvider";
import { deleteOutbox, outboxProgress, retryOutbox } from "./runtime";
import type { OutboxRecord } from "./types";

function PendingMessage({ row }: { row: OutboxRecord }) {
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const fraction = outboxProgress(row.id);
  const percentage = Math.round(fraction * 100);
  return (
    <article
      className="rounded-xl border bg-muted/30 px-3 py-2 text-sm"
      aria-label="Queued message"
      data-outbox-id={row.id}
    >
      {editing ? (
        <OutboxEditor row={row} onClose={() => setEditing(false)} />
      ) : (
        <p className="whitespace-pre-wrap break-words">{row.message.content}</p>
      )}
      {row.attachments.length > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {row.attachments.map((attachment) => attachment.name).join(", ")}
        </p>
      ) : null}
      <div
        className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"
        role="status"
      >
        {row.state === "sending" && row.attachments.length > 0 ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 20 20"
            role="progressbar"
            aria-label="Uploading attachments"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="currentColor"
              opacity="0.2"
              strokeWidth="2"
            />
            <circle
              cx="10"
              cy="10"
              r="8"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              pathLength="100"
              strokeDasharray={`${percentage} 100`}
              transform="rotate(-90 10 10)"
            />
          </svg>
        ) : null}
        <span>
          {row.accepted
            ? "Sent · Agent start pending"
            : row.state === "editing"
              ? "Editing · not sent"
              : row.state === "failed"
                ? "Could not send"
                : row.state === "sending"
                  ? "Sending…"
                  : "Waiting to send…"}
        </span>
        {row.error ? (
          <span className="min-w-0 truncate" title={row.error}>
            {row.error}
          </span>
        ) : null}
      </div>
      {row.state !== "sending" && !editing ? (
        <div className="mt-2 flex gap-3 text-xs">
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => retryOutbox(row.id))}
          >
            Retry
          </button>
          <button
            type="button"
            disabled={busy || row.deliveryUncertain || row.accepted}
            title={
              row.deliveryUncertain
                ? "Retry to confirm delivery before editing"
                : undefined
            }
            onClick={() =>
              void run(async () => {
                await prepareOutboxEditor(row.id);
                setEditing(true);
              })
            }
          >
            Edit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => deleteOutbox(row.id))}
          >
            Delete
          </button>
        </div>
      ) : null}
    </article>
  );
}

/** Pending sends belong to the captured conversation, never the current draft. */
export function OutboxRows({
  channelId,
  rootId,
}: {
  channelId?: string | null;
  rootId?: string | null;
}) {
  const { rows } = React.useContext(OutboxContext);
  const visible = rows.filter(
    (row) =>
      row.message.channelId === channelId &&
      row.message.rootEventId === (rootId ?? null),
  );
  return visible.length > 0 ? (
    <section
      className="mb-2 flex max-h-64 flex-col gap-2 overflow-y-auto"
      aria-label="Messages waiting to send"
    >
      {visible.map((row) => (
        <PendingMessage key={row.id} row={row} />
      ))}
    </section>
  ) : null;
}

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";
import type { TimelineMessage } from "../types";
import type { ChannelThreadLinks } from "../useChannelThreadLinks";

export const ThreadOrganizationContext =
  React.createContext<ChannelThreadLinks | null>(null);

export function ThreadOrganizationNotice() {
  const organization = React.useContext(ThreadOrganizationContext);
  if (!organization) return null;
  const {
    snapshot,
    loading,
    error,
    refresh,
    pending,
    undoBusy,
    undoError,
    undo,
  } = organization;
  const problems =
    snapshot?.projection.decisions.filter((d) => d.state !== "selected") ?? [];
  const incomplete = snapshot?.projection.status === "incomplete";
  if (
    !loading &&
    !error &&
    !incomplete &&
    !problems.length &&
    !pending.length &&
    !undoError
  )
    return null;
  return (
    <div
      className="border-b border-border/60 bg-muted/30 px-4 py-2 text-xs text-muted-foreground"
      data-testid="thread-organization-notice"
      role="status"
    >
      {loading ? (
        <p>
          Verifying thread organization. Only fully verified organization is
          shown.
        </p>
      ) : null}
      {error ? (
        <p>
          {error}{" "}
          <button type="button" className="underline" onClick={refresh}>
            Retry
          </button>
        </p>
      ) : null}
      {incomplete ? (
        <p>
          Thread history is incomplete. Showing original positions; projected
          totals are unavailable.
        </p>
      ) : null}
      {problems.length ? (
        <details>
          <summary>
            {problems.length} organization{" "}
            {problems.length === 1 ? "receipt needs" : "receipts need"} review
          </summary>
          <ul className="mt-2 space-y-2">
            {problems.map((decision) => (
              <li key={decision.annotationId} className="break-all">
                {decision.state}: {decision.reason} · annotation{" "}
                {decision.annotationId} · message {decision.childId}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {snapshot?.projection.issues.length ? (
        <p>{snapshot.projection.issues.join(" · ")}</p>
      ) : null}
      {pending.map((receipt) => (
        <p key={receipt.event.id} className="break-all">
          Undo pending verification · {receipt.event.id}{" "}
          <button
            type="button"
            disabled={undoBusy}
            className="underline disabled:opacity-50"
            onClick={() => void undo(receipt.childId, receipt.previousId)}
          >
            Verify / retry saved undo
          </button>
        </p>
      ))}
      {undoError ? <p role="alert">{undoError}</p> : null}
    </div>
  );
}

/** Read-only audit by default; the author's explicit undo signs a new receipt. */
export function ThreadOrganizationBadge({
  message,
}: {
  message: TimelineMessage;
}) {
  const context = React.useContext(ThreadOrganizationContext);
  const organization = message.threadOrganization;
  if (!organization) return null;
  const canUndo =
    context?.identity === organization.organizerPubkey &&
    organization.operation === "link";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2"
          data-testid="thread-organization-badge"
        >
          {organization.operation === "unlink"
            ? "Original position restored"
            : "Organized reply"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 max-w-[80vw] space-y-2 text-xs"
        data-testid="thread-organization-audit"
      >
        <p>
          Organization changes this view. Original signed messages remain
          unchanged.
        </p>
        <dl className="space-y-1 break-all">
          <dt>Message</dt>
          <dd>{message.id}</dd>
          <dt>Original position</dt>
          <dd>
            {organization.canonicalParentId
              ? `Reply to ${organization.canonicalParentId}`
              : "Channel top level"}
          </dd>
          {organization.canonicalRootId ? (
            <>
              <dt>Original thread</dt>
              <dd>{organization.canonicalRootId}</dd>
            </>
          ) : null}
          <dt>Annotation</dt>
          <dd>{organization.annotationId}</dd>
        </dl>
        {canUndo ? (
          <button
            type="button"
            disabled={context.undoBusy}
            className="rounded border px-2 py-1 disabled:opacity-50"
            onClick={() =>
              void context.undo(message.id, organization.annotationId)
            }
          >
            Restore original position
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

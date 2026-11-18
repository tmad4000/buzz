import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { audienceDescription, type ForwardAudiences } from "./audience";

/** Explicit recipient consent; opening, cancellation and dismissal never publish. */
export function ForwardAudienceConfirm({
  audiences,
  targetLabel,
  note,
  busy,
  onCancel,
  onConfirm,
}: {
  audiences: ForwardAudiences | null;
  targetLabel?: string;
  note: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={Boolean(audiences)}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Forward to{" "}
            {targetLabel ?? audiences?.target.channel.name ?? "this audience"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {audiences ? audienceDescription(audiences.target) : ""} The quoted
            message and source link will be shared with this audience.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {audiences ? (
          <>
            <p className="text-sm text-muted-foreground">
              From {audienceDescription(audiences.source)}
            </p>
            <ul
              aria-label="Target audience"
              className="max-h-48 space-y-2 overflow-y-auto text-sm"
            >
              {audiences.target.members.map((m) => (
                <li key={m.pubkey}>
                  <span>{m.displayName ?? "Unnamed member"}</span>
                  <code className="ml-2 break-all text-xs text-muted-foreground">
                    {m.pubkey}
                  </code>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              {note
                ? `Your note: ${note}`
                : "No new instruction added; the original is quoted reference material."}
            </p>
          </>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onCancel}
            >
              Cancel
            </Button>
          </AlertDialogCancel>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            Confirm audience and forward
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

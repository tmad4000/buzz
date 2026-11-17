import * as React from "react";
import { openWitFeedback } from "../witFeedback";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog";

/** The app-owned menu opens the shared feedback panel only after an explicit tap. */
export function SendFeedbackController({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt intentionally retries a failed widget load.
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    setError("");
    void openWitFeedback().then(
      () => {
        if (active) onOpenChange(false);
      },
      (reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      },
    );
    return () => {
      active = false;
    };
  }, [open, attempt, onOpenChange]);
  return (
    <Dialog open={open && Boolean(error)} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Send feedback</DialogTitle>
        <p>{error}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>Retry</Button>
      </DialogContent>
    </Dialog>
  );
}

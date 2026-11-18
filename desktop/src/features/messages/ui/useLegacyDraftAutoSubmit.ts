import * as React from "react";
import { scheduleSettleGatedAutoSubmit } from "./messageComposerAutoSubmit";

/** Existing standalone mount trigger. Scoped composers continue passing null. */
export function useLegacyDraftAutoSubmit({
  autoSubmitDraftKey,
  effectiveDraftKey,
  onAutoSubmitComplete,
  submit,
}: {
  autoSubmitDraftKey: string | null;
  effectiveDraftKey: string | null | undefined;
  onAutoSubmitComplete?: () => void;
  submit: () => void;
}) {
  const latest = React.useRef({ onAutoSubmitComplete, submit });
  latest.current = { onAutoSubmitComplete, submit };
  // biome-ignore lint/correctness/useExhaustiveDependencies: legacy mount-only command, not a key-change trigger
  React.useEffect(() => {
    if (autoSubmitDraftKey === null || autoSubmitDraftKey !== effectiveDraftKey)
      return;
    latest.current.onAutoSubmitComplete?.();
    return scheduleSettleGatedAutoSubmit({
      submit: () => latest.current.submit(),
    });
  }, []);
}

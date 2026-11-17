import * as React from "react";
import { useConversationControlScope } from "@/features/conversations/ConversationViewContext";

import { subscribeToFocusedThreadCloseRequest } from "@/features/channels/focusedThreadCloseRequest";

/** Retains coverage until the owning presence boundary completes its exit. */
export function usePresenceCoverage(open: boolean) {
  const [present, setPresent] = React.useState(false);

  React.useEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  const markExitComplete = React.useCallback(() => setPresent(false), []);
  return {
    covered: open || present,
    markExitComplete,
  };
}

/** Keeps the covered channel inert and owns external dismissal while open. */
export function useFocusDrawerPresence(open: boolean, onClose: () => void) {
  const { active, canHandle } = useConversationControlScope();
  const { covered, markExitComplete } = usePresenceCoverage(open);

  React.useEffect(() => {
    if (!open || !active) return;
    return subscribeToFocusedThreadCloseRequest(() => {
      if (canHandle()) onClose();
    });
  }, [active, canHandle, onClose, open]);

  return {
    channelIsCovered: covered,
    markExitComplete,
  };
}

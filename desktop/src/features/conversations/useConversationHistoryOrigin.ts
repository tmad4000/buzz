import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { ConversationHistoryOrigins } from "./historyOrigin";

export function useConversationHistoryOrigin() {
  const { history } = useRouter();
  const origins = React.useMemo(
    () => new ConversationHistoryOrigins(history),
    [history],
  );
  return React.useSyncExternalStore(
    origins.subscribe,
    origins.getSnapshot,
    origins.getSnapshot,
  );
}

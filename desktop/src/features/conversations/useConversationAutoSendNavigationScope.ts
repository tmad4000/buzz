import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import {
  autoSendPermitsFor,
  bindAutoSendHistoryEntry,
} from "./autoSendNavigation";

/** Publish only the committed workspace scope; global Drafts UI may arm within it. */
export function useConversationAutoSendNavigationScope(
  scopeKey: string | null,
) {
  const router = useRouter();
  const current = React.useRef(scopeKey);
  current.current = scopeKey;
  React.useLayoutEffect(() => {
    if (!scopeKey) return;
    const permits = autoSendPermitsFor(router.history);
    const unbind = permits.bindScope(
      scopeKey,
      () =>
        current.current === scopeKey &&
        document.visibilityState === "visible" &&
        document.hasFocus(),
    );
    const stop = router.history.subscribe(({ location, action }) => {
      bindAutoSendHistoryEntry(permits, location, action.type);
    });
    const retire = () => permits.retirePending();
    window.addEventListener("blur", retire);
    document.addEventListener("visibilitychange", retire);
    return () => {
      stop();
      unbind();
      window.removeEventListener("blur", retire);
      document.removeEventListener("visibilitychange", retire);
    };
  }, [router, scopeKey]);
}

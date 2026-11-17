import * as React from "react";

export type ConversationViewAdmission = {
  viewInstanceId: string;
  focused: boolean;
  visible: boolean;
  /** Workspace-level activity; independent of which sibling currently has focus. */
  interactive?: boolean;
  rootRef?: React.RefObject<HTMLElement | null>;
  contentWidthPx?: number;
};

/** Presentation identity and admission, separate from the canonical chat resource. */
export const ConversationViewContext =
  React.createContext<ConversationViewAdmission | null>(null);

/** Scope keyboard actions and deferred DOM lookups to their owning view. */
export function useConversationControlScope() {
  const view = React.useContext(ConversationViewContext);
  const active = view === null || (view.focused && view.visible);
  const current = React.useRef({ active, view });
  current.current = { active, view };
  const mounted = React.useRef(true);
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canHandle = React.useCallback(
    () =>
      mounted.current &&
      current.current.active &&
      (current.current.view === null || documentVisible()),
    [],
  );
  const canRestoreFocus = React.useCallback(() => {
    const owner = current.current.view;
    const root = owner?.rootRef?.current;
    // This child may already be unmounted: its context snapshot no longer
    // follows sibling focus. The still-mounted host publishes live admission.
    return (
      owner === null ||
      (current.current.active &&
        documentVisible() &&
        root?.isConnected === true &&
        !root.hidden &&
        root.dataset.focusedConversation === "true")
    );
  }, []);
  const query = React.useCallback(
    (selector: string) => {
      if (!canHandle()) return null;
      const owner = current.current.view;
      // A scoped view without a connected root must never fall through to a sibling.
      if (!owner) return document.querySelector<HTMLElement>(selector);
      const root = owner.rootRef?.current;
      return root?.isConnected
        ? root.querySelector<HTMLElement>(selector)
        : null;
    },
    [canHandle],
  );
  return { active, canHandle, canRestoreFocus, query };
}

function documentVisible() {
  return (
    typeof document !== "undefined" &&
    document.visibilityState === "visible" &&
    document.hasFocus()
  );
}

/** Automatic acknowledgements require a focused visible view and foreground document. */
export function useConversationReadAdmission() {
  const view = React.useContext(ConversationViewContext);
  const [foreground, setForeground] = React.useState(documentVisible);
  React.useEffect(() => {
    const update = () => setForeground(documentVisible());
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    update();
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
    };
  }, []);
  const admitted =
    foreground && (view === null || (view.focused && view.visible));
  const currentAdmission = React.useRef(admitted);
  currentAdmission.current = admitted;
  React.useLayoutEffect(() => {
    currentAdmission.current = admitted;
    return () => {
      currentAdmission.current = false;
    };
  }, [admitted]);
  // Recheck document state at callback time: an observer may already be queued
  // when the document becomes hidden, before React commits the visibility event.
  const canRead = React.useCallback(
    () => currentAdmission.current && admitted && documentVisible(),
    [admitted],
  );
  return { admitted, canRead };
}

import * as React from "react";

export type ConversationViewAdmission = {
  viewInstanceId: string;
  focused: boolean;
  visible: boolean;
};

/** Presentation identity and admission, separate from the canonical chat resource. */
export const ConversationViewContext =
  React.createContext<ConversationViewAdmission | null>(null);

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

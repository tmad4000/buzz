import * as React from "react";
import { createReadingRestoreAdmission } from "./readingRestoreAdmission";

/** A committed scroller owner; retired frames cannot revive on focus/uncover. */
export function useReadingRestoreAdmission(
  ownerKey: string | null,
  container: React.RefObject<HTMLElement | null>,
  canRestore: () => boolean,
) {
  const current = React.useRef<ReturnType<
    typeof createReadingRestoreAdmission
  > | null>(null);
  React.useLayoutEffect(() => {
    if (!ownerKey) return;
    const admission = createReadingRestoreAdmission({
      windowEvents: window,
      documentEvents: document,
      canRestore,
    });
    current.current = admission;
    const observer = new MutationObserver(admission.invalidate);
    for (
      let node: HTMLElement | null = container.current;
      node;
      node = node.parentElement
    )
      observer.observe(node, {
        attributes: true,
        attributeFilter: [
          "hidden",
          "inert",
          "aria-hidden",
          "data-focused-conversation",
        ],
      });
    return () => {
      observer.disconnect();
      admission.dispose();
      if (current.current === admission) current.current = null;
    };
  }, [ownerKey, container, canRestore]);
  return current;
}

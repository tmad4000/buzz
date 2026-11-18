import * as React from "react";
import { useConversationControlScope } from "@/features/conversations/ConversationViewContext";

/** Retry an explicit revealed-row jump after its deferred row commits. */
export function useThreadPendingJump({
  pendingJump,
  root,
  container,
  rows,
  collapsed,
  pending,
  error,
  resolved,
}: {
  pendingJump: { root: string; id: string } | null;
  root: string | null;
  container: React.RefObject<HTMLElement | null>;
  rows: unknown;
  collapsed: boolean;
  pending: boolean;
  error: boolean;
  resolved: () => void;
}) {
  const { active, canHandle } = useConversationControlScope();
  React.useLayoutEffect(() => {
    // These are commit triggers; the target must be read from the actual DOM.
    void rows;
    void collapsed;
    void pending;
    void error;
    void active;
    if (!canHandle() || !pendingJump || pendingJump.root !== root) return;
    const element = container.current;
    if (
      !element?.isConnected ||
      element.closest('[hidden], [inert], [aria-hidden="true"]')
    )
      return;
    const row = element.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(pendingJump.id)}"]`,
    );
    if (!row) return;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    resolved();
  }, [
    pendingJump,
    root,
    container,
    rows,
    collapsed,
    pending,
    error,
    active,
    canHandle,
    resolved,
  ]);
}

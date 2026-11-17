import * as React from "react";
import type { TimelineMessage } from "../types";
/** A mounted/auto-expanded subtree is not evidence that its rows were visible. */
export function useVisibleThreadReplies(
  container: React.RefObject<HTMLElement | null>,
  messages: TimelineMessage[],
  onReveal:
    | ((messages: TimelineMessage[], rootId?: string) => void)
    | undefined,
  rootId: string,
  scope: string,
) {
  const sent = React.useRef({ scope, ids: new Set<string>() });
  React.useLayoutEffect(() => {
    if (sent.current.scope !== scope) sent.current = { scope, ids: new Set() };
  }, [scope]);
  React.useEffect(() => {
    const root = container.current;
    if (!root || !onReveal || typeof IntersectionObserver === "undefined")
      return;
    const eligible = new Map(
      messages
        .filter((message) => !message.pending)
        .map((message) => [message.id, message]),
    );
    let alive = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!alive || sent.current.scope !== scope) return;
        const revealed: TimelineMessage[] = [];
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          if (
            !entry.isIntersecting ||
            !node.isConnected ||
            !root.contains(node) ||
            node.getClientRects().length === 0
          )
            continue;
          const id = node.dataset.messageId;
          const message = id ? eligible.get(id) : undefined;
          if (message && !sent.current.ids.has(message.id)) {
            sent.current.ids.add(message.id);
            revealed.push(message);
          }
        }
        if (revealed.length) onReveal(revealed, rootId);
      },
      { threshold: 0.01 },
    );
    for (const row of root.querySelectorAll<HTMLElement>(
      '[data-testid="message-row"][data-message-id]',
    ))
      if (eligible.has(row.dataset.messageId ?? "")) observer.observe(row);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [container, messages, onReveal, rootId, scope]);
}

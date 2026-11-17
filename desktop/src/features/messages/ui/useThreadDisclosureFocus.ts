import * as React from "react";
import type { TimelineMessage } from "../types";

type Options = {
  scope: string;
  root: string | null;
  regions: React.RefObject<HTMLElement | null>[];
  messages: ReadonlyMap<string, TimelineMessage>;
  expanded: ReadonlySet<string>;
};
type CapturedFocus = { element: HTMLElement; ancestry: string[] };
/** Keep focus at the owner disclosure across local, deferred and synchronized tree changes. */
export function useThreadDisclosureFocus(options: Options) {
  const live = React.useRef(options);
  React.useLayoutEffect(() => {
    live.current = options;
  });
  const captured = React.useRef<CapturedFocus | null>(null);
  const pending = React.useRef<string[]>([]);
  const previous = React.useRef({
    scope: options.scope,
    expanded: options.expanded,
  });
  React.useLayoutEffect(() => {
    if (!options.root || typeof document === "undefined") return;
    const scope = options.scope;
    const record = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof window.HTMLElement)) return;
      const current = live.current;
      if (current.scope !== scope) return;
      if (!current.regions.some((ref) => ref.current?.contains(target))) {
        // Removing a node can return focus to body without a user focus move.
        if (
          target === document.body &&
          captured.current &&
          !captured.current.element.isConnected
        )
          return;
        captured.current = null;
        pending.current = [];
        return;
      }
      const owner = target.closest<HTMLElement>(
        "[data-message-id], [data-thread-head-id]",
      );
      let id =
        owner?.dataset.messageId ?? owner?.dataset.threadHeadId ?? current.root;
      const ancestry: string[] = [];
      const seen = new Set<string>();
      while (id && !seen.has(id)) {
        ancestry.push(id);
        seen.add(id);
        if (id === current.root) break;
        id = current.messages.get(id)?.parentId ?? null;
      }
      if (current.root && !seen.has(current.root)) ancestry.push(current.root);
      captured.current = { element: target, ancestry };
      pending.current = [];
    };
    document.addEventListener("focusin", record, true);
    return () => {
      document.removeEventListener("focusin", record, true);
      captured.current = null;
      pending.current = [];
    };
  }, [options.scope, options.root]);
  React.useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { scope: options.scope, expanded: options.expanded };
    if (old.scope !== options.scope || !options.root) {
      captured.current = null;
      pending.current = [];
      return;
    }
    const focus = captured.current;
    if (!focus) return;
    const closedAncestors = focus.ancestry.filter(
      (id) => old.expanded.has(id) && !options.expanded.has(id),
    );
    const owner = focus.element.dataset.threadHeadId;
    const ownerChanged =
      owner && old.expanded.has(owner) !== options.expanded.has(owner)
        ? [owner]
        : [];
    if (closedAncestors.length || ownerChanged.length)
      pending.current = [
        ...new Set([...closedAncestors, ...ownerChanged, ...pending.current]),
      ];
    if (!pending.current.length) return;
    if (focus.element.isConnected) {
      if (
        pending.current.some(
          (id) =>
            id === owner &&
            focus.element.getAttribute("aria-expanded") ===
              String(options.expanded.has(id)),
        )
      )
        pending.current = [];
      return;
    }
    // Another explicit focus move wins, including focus in another surface.
    if (
      document.activeElement !== document.body &&
      document.activeElement !== focus.element
    ) {
      pending.current = [];
      return;
    }
    for (const id of pending.current) {
      for (const region of options.regions) {
        const target = [
          ...(region.current?.querySelectorAll<HTMLButtonElement>(
            "button[data-thread-head-id][aria-expanded]",
          ) ?? []),
        ].find(
          (button) =>
            button.dataset.threadHeadId === id &&
            button.getAttribute("aria-expanded") ===
              String(options.expanded.has(id)),
        );
        if (!target) continue;
        pending.current = [];
        target.focus({ preventScroll: true });
        return;
      }
    }
  });
}

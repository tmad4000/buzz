import * as React from "react";
import { ConversationViewContext } from "./ConversationViewContext";

type LeaveGuard = () => boolean;
type Registration = { viewId: string; guard: LeaveGuard };

/** Scoped to one authorized workspace; registrations belong to component lifetimes. */
export class ConversationViewGuards {
  private registrations = new Set<Registration>();
  register(viewId: string, guard: LeaveGuard) {
    const entry = { viewId, guard };
    this.registrations.add(entry);
    return () => {
      this.registrations.delete(entry);
    };
  }
  allow(viewId: string) {
    const entries = [...this.registrations].filter(
      (entry) => entry.viewId === viewId,
    );
    for (const entry of entries) {
      if (!this.registrations.has(entry) || !entry.guard()) return false;
    }
    // A guard may synchronously replace a mounted editor/dialog. Retry against
    // the new committed registrations instead of accepting the stale result.
    const current = [...this.registrations].filter(
      (entry) => entry.viewId === viewId,
    );
    return (
      current.length === entries.length &&
      current.every((entry, index) => entry === entries[index])
    );
  }
}
export const ConversationViewGuardsContext =
  React.createContext<ConversationViewGuards | null>(null);

/** Register even for a hidden/background view; admission is determined by the explicit target. */
export function useConversationLeaveGuard(guard: LeaveGuard) {
  const registry = React.useContext(ConversationViewGuardsContext);
  const viewId = React.useContext(ConversationViewContext)?.viewInstanceId;
  const current = React.useRef(guard);
  React.useLayoutEffect(() => {
    current.current = guard;
  });
  React.useLayoutEffect(() => {
    if (!registry || !viewId) return;
    return registry.register(viewId, () => current.current());
  }, [registry, viewId]);
}

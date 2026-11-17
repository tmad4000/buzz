export type ConversationHistoryOrigin = {
  entryKey: string | undefined;
  traversal: boolean;
  fresh: boolean;
};
type HistoryPort = {
  location: { state: { __TSR_key?: string } };
  subscribe: (
    listener: (event: {
      location: { state: { __TSR_key?: string } };
      action: { type: string };
    }) => void,
  ) => () => void;
};

/** Tracks navigation action, not copied/persistent view metadata. Cold boot is an external route. */
export class ConversationHistoryOrigins {
  private value: ConversationHistoryOrigin;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private history: HistoryPort;
  constructor(history: HistoryPort) {
    this.history = history;
    this.value = {
      entryKey: history.location.state.__TSR_key,
      traversal: false,
      fresh: false,
    };
  }
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.unsubscribe) {
      const key = this.history.location.state.__TSR_key;
      const changed = key !== this.value.entryKey;
      if (changed)
        this.value = { entryKey: key, traversal: false, fresh: false };
      this.unsubscribe = this.history.subscribe(({ location, action }) => {
        this.value = {
          entryKey: location.state.__TSR_key,
          fresh: action.type === "PUSH" || action.type === "REPLACE",
          traversal:
            action.type === "BACK" ||
            action.type === "FORWARD" ||
            action.type === "GO",
        };
        for (const notify of this.listeners) notify();
      });
      if (changed) for (const notify of this.listeners) notify();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.unsubscribe?.();
        this.unsubscribe = null;
      }
    };
  };
}

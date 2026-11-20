import * as React from "react";
import {
  MAX_OPEN_THREAD_PINS,
  parseOpenThreadPins,
  restoreOpenThreadPin,
  type OpenThreadPin,
} from "./openThreadPins";

import {
  DEFAULT_ACTIVE_THREAD_PREFERENCES,
  parseActiveThreadPreferences,
  type ActiveThreadPreferences,
} from "./activeThreadsPhase0";

type Register = { pin: OpenThreadPin | null; rank: number };
type Snapshot = {
  pins: OpenThreadPin[];
  sessionOnly: boolean;
  dismissedSuggestions: ReadonlySet<string>;
  activePreferences: ActiveThreadPreferences;
};
const owners = new Map<string, PinStore>();
const MAX_REGISTERS = 1000;
const MAX_STORAGE_KEYS = 10000;

/** Per-pin registers prevent different views/tabs from replacing each other's
 * unrelated pins. Tombstones override legacy v1 references without resurrecting
 * removals; the original array is a read-only migration seed.
 */
class PinStore {
  private readonly prefix: string;
  private readonly dismissPrefix: string;
  private storedDismissals = new Set<string>();
  private durableKeys = new Set<string>();
  private durableReady = false;
  private readonly volatileDismissals = new Set<string>();
  private readonly key: string;
  private volatilePreferences: ActiveThreadPreferences | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly volatile = new Map<string, Register>();
  private snapshot: Snapshot = {
    activePreferences: DEFAULT_ACTIVE_THREAD_PREFERENCES,
    pins: [],
    sessionOnly: false,
    dismissedSuggestions: new Set(),
  };
  private registers = new Map<string, Register>();
  private signature = "";
  private capacityFailure = false;
  constructor(key: string) {
    this.key = key;
    this.prefix = `${key}:pin.v2:`;
    this.dismissPrefix = `${key}:busyDismissed.v1:`;
    this.refresh();
  }
  getSnapshot = () => this.snapshot;
  private storageEvent = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === this.key ||
      event.key === `${this.key}:busySuggestions.v1` ||
      event.key.startsWith(this.prefix) ||
      event.key.startsWith(this.dismissPrefix)
    )
      this.refresh();
  };
  subscribe = (listener: () => void) => {
    owners.set(this.key, this);
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      window.addEventListener("storage", this.storageEvent);
      this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        window.removeEventListener("storage", this.storageEvent);
        if (owners.get(this.key) === this) owners.delete(this.key);
      }
    };
  };
  private read() {
    const result = new Map<string, Register>();
    parseOpenThreadPins(localStorage.getItem(this.key)).forEach((pin, rank) => {
      if (!pin.id.startsWith("optimistic-")) result.set(pin.id, { pin, rank });
    });
    const keyCount = localStorage.length;
    if (keyCount > MAX_STORAGE_KEYS)
      throw new Error("Preference storage is too large");
    const durableKeys = new Set<string>();
    const dismissed = new Set<string>();
    // Allocation is capped at1000; bounded reads still preserve all existing
    // records if older clients or concurrent tabs have exceeded that budget.
    for (let index = 0; index < keyCount; index++) {
      const name = localStorage.key(index);
      if (!name) continue;
      if (name.startsWith(this.dismissPrefix)) {
        durableKeys.add(name);
        const id = decodeURIComponent(name.slice(this.dismissPrefix.length));
        if (
          id &&
          id.length <= 128 &&
          !id.startsWith("optimistic-") &&
          localStorage.getItem(name) === "true"
        )
          dismissed.add(id);
        continue;
      }
      if (!name.startsWith(this.prefix)) continue;
      durableKeys.add(name);
      const id = decodeURIComponent(name.slice(this.prefix.length));
      try {
        const value = JSON.parse(localStorage.getItem(name) ?? "null");
        if (!value || !Number.isFinite(value.rank)) continue;
        const pin =
          value.pin === null
            ? null
            : parseOpenThreadPins(JSON.stringify([value.pin]))[0];
        if (
          pin === undefined ||
          (pin && pin.id !== id) ||
          id.startsWith("optimistic-")
        )
          continue;
        result.set(id, { pin, rank: value.rank });
      } catch {
        /* Invalid preference records do not become references. */
      }
    }
    this.durableKeys = durableKeys;
    this.storedDismissals = dismissed;
    return result;
  }
  private refresh = () => {
    let sessionOnly =
      this.volatile.size > 0 ||
      this.volatileDismissals.size > 0 ||
      this.capacityFailure ||
      this.volatilePreferences !== null;
    let activePreferences =
      this.volatilePreferences ?? this.snapshot.activePreferences;
    try {
      activePreferences =
        this.volatilePreferences ??
        parseActiveThreadPreferences(
          localStorage.getItem(`${this.key}:busySuggestions.v1`),
        );
      this.registers = this.read();
      this.durableReady = true;
    } catch {
      this.durableReady = false;
      sessionOnly = true;
    }
    for (const [id, record] of this.volatile) this.registers.set(id, record);
    const pins = [...this.registers.values()]
      .filter(
        (record): record is Register & { pin: OpenThreadPin } =>
          record.pin !== null,
      )
      .sort((a, b) => a.rank - b.rank || a.pin.id.localeCompare(b.pin.id))
      .map((record) => record.pin);
    const dismissedSuggestions = new Set([
      ...this.storedDismissals,
      ...this.volatileDismissals,
    ]);
    const signature = JSON.stringify([
      pins,
      activePreferences,
      sessionOnly,
      [...dismissedSuggestions].sort(),
    ]);
    if (signature === this.signature) return;
    this.signature = signature;
    this.snapshot = {
      pins,
      sessionOnly,
      dismissedSuggestions,
      activePreferences,
    };
    for (const listener of this.listeners) listener();
  };
  setActivePreferences = (preferences: ActiveThreadPreferences) => {
    const next = parseActiveThreadPreferences(JSON.stringify(preferences));
    try {
      localStorage.setItem(
        `${this.key}:busySuggestions.v1`,
        JSON.stringify(next),
      );
      this.volatilePreferences = null;
    } catch {
      this.volatilePreferences = next;
    }
    this.refresh();
  };
  private write(id: string, record: Register) {
    try {
      const key = `${this.prefix}${encodeURIComponent(id)}`;
      if (
        !this.durableReady ||
        (!this.durableKeys.has(key) && this.durableKeys.size >= MAX_REGISTERS)
      )
        throw new Error("Pin history is full or unavailable");
      // Volatile and v1-seeded identities are not allocated durable slots.
      localStorage.setItem(key, JSON.stringify(record));
      this.volatile.delete(id);
    } catch {
      if (this.volatile.has(id) || this.volatile.size < MAX_REGISTERS) {
        this.volatile.set(id, record);
      } else {
        this.capacityFailure = true;
      }
    }
    this.refresh();
  }
  add = (pin: OpenThreadPin, index?: number) => {
    this.refresh();
    const pins = this.snapshot.pins;
    if (
      pin.id.startsWith("optimistic-") ||
      pins.some((item) => item.id === pin.id) ||
      pins.length >= MAX_OPEN_THREAD_PINS
    )
      return;
    const next = restoreOpenThreadPin(pins, pin, index ?? pins.length);
    const position = next.findIndex((item) => item.id === pin.id);
    const before =
      position > 0
        ? (this.registers.get(next[position - 1].id)?.rank ?? 0)
        : null;
    const after =
      position + 1 < next.length
        ? (this.registers.get(next[position + 1].id)?.rank ?? 0)
        : null;
    const rank =
      before === null
        ? (after ?? 1) - 1
        : after === null
          ? before + 1
          : before / 2 + after / 2;
    this.write(pin.id, { pin, rank });
  };
  remove = (id: string) => {
    this.refresh();
    this.write(id, {
      pin: null,
      rank: this.registers.get(id)?.rank ?? 0,
    });
  };
  dismissSuggestion = (id: string) => {
    if (!id || id.length > 128 || id.startsWith("optimistic-")) return;
    this.refresh();
    try {
      const key = `${this.dismissPrefix}${encodeURIComponent(id)}`;
      if (
        !this.durableReady ||
        (!this.durableKeys.has(key) && this.durableKeys.size >= MAX_REGISTERS)
      )
        throw new Error("Pin preferences are full or unavailable");
      // Separate from pin membership so a concurrent tab's pin cannot be undone
      // by dismissal (and a pin/remove write cannot forget a dismissal).
      localStorage.setItem(key, "true");
      this.volatileDismissals.delete(id);
    } catch {
      if (this.volatileDismissals.size < MAX_REGISTERS)
        this.volatileDismissals.add(id);
      else this.capacityFailure = true;
    }
    this.refresh();
  };
}

/** One scoped preference owner for mounted same-chat views; storage events
 * reconcile other tabs. Each action writes only its own canonical root register.
 */
export function useOpenThreadPins(key: string) {
  const store = React.useMemo(() => {
    const owner = owners.get(key) ?? new PinStore(key);
    owners.set(key, owner);
    return owner;
  }, [key]);
  const snapshot = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  return {
    ...snapshot,
    setActivePreferences: store.setActivePreferences,
    addPin: store.add,
    removePin: store.remove,
    dismissSuggestion: store.dismissSuggestion,
  };
}

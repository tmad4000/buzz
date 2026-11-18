import type { LaneCodec, LaneStore } from "./sidebarLaneStore";

// Borrow the mounted sidebar owner's store. This registry cannot create or edit one.
const owners = new Map<
  string,
  Map<
    symbol,
    { store: Pick<LaneStore, "get" | "subscribe">; ready: () => boolean }
  >
>();
const listeners = new Set<() => void>();
export const notifySidebarLaneReadViews = () => {
  for (const listener of listeners) listener();
};
export function registerSidebarLaneReadView(
  codec: LaneCodec,
  pubkey: string,
  relayUrl: string,
  store: Pick<LaneStore, "get" | "subscribe">,
  ready: () => boolean,
): () => void {
  const key = codec.storageKey(pubkey, relayUrl);
  const entries = owners.get(key) ?? new Map();
  const registration = Symbol();
  entries.set(registration, { store, ready });
  owners.set(key, entries);
  const detach = store.subscribe(notifySidebarLaneReadViews);
  notifySidebarLaneReadViews();
  return () => {
    if (!entries.delete(registration)) return;
    detach();
    if (!entries.size && owners.get(key) === entries) owners.delete(key);
    notifySidebarLaneReadViews();
  };
}
/** No mounted owner (or ambiguous owners) means unavailable, never a disk fallback. */
export function readSidebarLaneView(
  codec: LaneCodec,
  pubkey: string,
  relayUrl: string,
) {
  const entries = owners.get(codec.storageKey(pubkey, relayUrl));
  const registrations = [...(entries?.values() ?? [])];
  if (registrations.some((entry) => !entry.ready())) return undefined;
  const stores = new Set(registrations.map((entry) => entry.store));
  return stores.size === 1 ? [...stores][0].get() : undefined;
}
export function subscribeSidebarLaneView(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

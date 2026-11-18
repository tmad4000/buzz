export type OpenThreadPin = { id: string; title: string };
export const MAX_OPEN_THREAD_PINS = 100;
/** Personal working-set preferences, separate from receipts and shared work. */
export function openThreadPinsKey(
  community: string,
  identity: string,
  channel: string,
) {
  return `buzz.openThreads.v1:${encodeURIComponent(community)}:${encodeURIComponent(identity)}:${encodeURIComponent(channel)}`;
}
/** Read bounded references; never import lifecycle assertions from storage. */
export function parseOpenThreadPins(raw: string | null): OpenThreadPin[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    const pins = new Map<string, OpenThreadPin>();
    for (const pin of value.slice(0, MAX_OPEN_THREAD_PINS)) {
      if (
        pin &&
        typeof pin.id === "string" &&
        pin.id.length <= 128 &&
        typeof pin.title === "string" &&
        pin.title.length <= 240
      )
        pins.set(pin.id, { id: pin.id, title: pin.title });
    }
    return [...pins.values()];
  } catch {
    return [];
  }
}
/** Search only eligible personal references, without changing membership. */
export function filterOpenThreadPins(
  pins: readonly OpenThreadPin[],
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase();
  return pins.filter((pin) => pin.title.toLocaleLowerCase().includes(needle));
}

/** Undo removal without discarding pins added since that removal. */
export function restoreOpenThreadPin(
  pins: readonly OpenThreadPin[],
  pin: OpenThreadPin,
  index: number,
): OpenThreadPin[] {
  if (
    pins.some((item) => item.id === pin.id) ||
    pins.length >= MAX_OPEN_THREAD_PINS
  )
    return [...pins];
  const next = [...pins];
  next.splice(Math.min(index, next.length), 0, pin);
  return next;
}

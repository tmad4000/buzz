import { useSyncExternalStore } from "react";
const KEY = "buzz.direct-agent-runtime.v1";
const listeners = new Set<() => void>();
function read() {
  try {
    return globalThis.localStorage?.getItem(KEY) === "true";
  } catch {
    return false;
  }
}
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
/** Device-local opt-in; stored before notifying so failures stay visible. */
export function setRuntimeCardsEnabled(value: boolean) {
  globalThis.localStorage.setItem(KEY, String(value));
  for (const fn of listeners) fn();
}
export function useRuntimeCardsEnabled() {
  return useSyncExternalStore(subscribe, read, () => false);
}

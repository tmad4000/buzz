import { useSyncExternalStore } from "react";
const KEY = "buzz.private-agent-fleet.v1";
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};
function read() {
  try {
    return globalThis.localStorage?.getItem(KEY) === "true";
  } catch {
    return false;
  }
}
function subscribe(fn: () => void) {
  if (!listeners.size) window.addEventListener("storage", notify);
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
    if (!listeners.size) window.removeEventListener("storage", notify);
  };
}
export function setFleetEnabled(value: boolean) {
  globalThis.localStorage.setItem(KEY, String(value));
  notify();
}
export function useFleetEnabled() {
  return useSyncExternalStore(subscribe, read, () => false);
}

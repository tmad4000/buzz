import { useSyncExternalStore } from "react";
const KEY = "buzz.forward-to-agent.v1";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return globalThis.localStorage?.getItem(KEY) === "true";
  } catch {
    return false;
  }
};
export function setForwardAgentEnabled(value: boolean) {
  globalThis.localStorage.setItem(KEY, String(value));
  for (const fn of listeners) fn();
}
export function useForwardAgentEnabled() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    read,
    () => false,
  );
}

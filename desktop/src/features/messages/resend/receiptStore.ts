import type { RelayEvent } from "@/shared/api/types";
export type ResendReceipt = {
  event: RelayEvent;
  phase: "pending" | "sent";
  error?: string;
};
const receipts = new Map<string, ResendReceipt>();
const listeners = new Map<string, Set<() => void>>();
export const getResendReceipt = (key: string) => receipts.get(key) ?? null;
export function setResendReceipt(key: string, value: ResendReceipt) {
  receipts.set(key, value);
  for (const notify of listeners.get(key) ?? []) notify();
}
export function subscribeResendReceipt(key: string, notify: () => void) {
  const set = listeners.get(key) ?? new Set();
  set.add(notify);
  listeners.set(key, set);
  return () => {
    set.delete(notify);
    if (!set.size) listeners.delete(key);
  };
}

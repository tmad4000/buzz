import { useSyncExternalStore } from "react";

const KEY = "buzz.conversation.stayWhenSending";
const CHANGE = "buzz-stay-when-sending-change";

export function getStayWhenSending(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setStayWhenSending(value: boolean): void {
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
    window.dispatchEvent(new Event(CHANGE));
  } catch {
    // An unavailable preference backend leaves the default in effect.
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(CHANGE, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE, listener);
    window.removeEventListener("storage", listener);
  };
}

export function useStayWhenSending(): boolean {
  return useSyncExternalStore(subscribe, getStayWhenSending, () => false);
}

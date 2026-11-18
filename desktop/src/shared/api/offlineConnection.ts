import * as React from "react";
import { offlineCacheEnabled } from "./offlineCache";
import { relayClient } from "./relayClient";
import { useRelayConnection } from "./useRelayConnection";

/** Immediate callback-time fence; connection loss must win over a queued observer. */
export function offlineNeedsConnection(): boolean {
  return (
    offlineCacheEnabled() &&
    ((typeof navigator !== "undefined" && navigator.onLine === false) ||
      relayClient.getConnectionState() !== "connected")
  );
}
/** Reuse relay state, plus the browser's network-loss signal. */
export function useDeviceOffline(): boolean {
  const [enabled] = React.useState(offlineCacheEnabled);
  const relay = useRelayConnection({ enabled });
  const [online, setOnline] = React.useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  React.useEffect(() => {
    if (!enabled) return;
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [enabled]);
  return enabled && (!online || relay !== "connected");
}

let trackedWindow: Window | null = null;
let networkGeneration = 0;
let lastOnline = true;
const advanceNetwork = () => {
  const online = typeof navigator === "undefined" || navigator.onLine !== false;
  if (online !== lastOnline) {
    networkGeneration++;
    lastOnline = online;
  }
};
/** A browser network gap also invalidates authority when the socket has not noticed it yet. */
export function offlineConnectionEpoch(): string {
  if (
    offlineCacheEnabled() &&
    typeof window !== "undefined" &&
    trackedWindow !== window
  ) {
    trackedWindow?.removeEventListener("online", advanceNetwork);
    trackedWindow?.removeEventListener("offline", advanceNetwork);
    trackedWindow = window;
    lastOnline = typeof navigator === "undefined" || navigator.onLine !== false;
    window.addEventListener("online", advanceNetwork);
    window.addEventListener("offline", advanceNetwork);
  }
  return `${relayClient.getConnectionGeneration()}:${networkGeneration}`;
}

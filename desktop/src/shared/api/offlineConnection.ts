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
  const relay = useRelayConnection();
  const [online, setOnline] = React.useState(
    () => typeof navigator === "undefined" || navigator.onLine !== false,
  );
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offlineCacheEnabled() && (!online || relay !== "connected");
}

/** Reuse the relay's existing generation fence; community teardown cannot remove it. */
export function offlineConnectionEpoch(): number {
  return relayClient.getConnectionGeneration();
}

import * as React from "react";
import { toast } from "sonner";
import { usePresenceQuery } from "../hooks";
import {
  advanceHostWatch,
  hostOfflineText,
  hostTime,
  isPaseoCommunity,
  PASEO_HOST_PUBKEY,
  PASEO_STALE_MS,
  type HostWatch,
} from "../lib/paseoHostHealth";
import { PaseoHostContext } from "@/shared/context/PaseoHostContext";
import { sendDesktopNotification } from "@/features/notifications/lib/desktop";

function readWatch(key: string): HostWatch {
  const fresh = { startedAt: Date.now(), lastSeenAt: null, offlineSince: null };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value &&
      Number.isFinite(value.startedAt) &&
      value.startedAt > 0 &&
      value.startedAt <= Date.now() &&
      (value.lastSeenAt === null ||
        (Number.isFinite(value.lastSeenAt) &&
          value.lastSeenAt <= Date.now())) &&
      (value.offlineSince === null ||
        (Number.isFinite(value.offlineSince) &&
          value.offlineSince <= Date.now()))
    )
      return value;
  } catch {
    /* A denied cache must not prevent the live watch. */
  }
  return fresh;
}
export function PaseoHostProvider({
  pubkey,
  relayUrl,
  children,
}: {
  pubkey?: string;
  relayUrl?: string;
  children: React.ReactNode;
}) {
  if (!pubkey || !isPaseoCommunity(relayUrl))
    return (
      <PaseoHostContext.Provider value={{ offlineSince: null }}>
        {children}
      </PaseoHostContext.Provider>
    );
  return (
    <HostWatchScope
      key={`${pubkey}:${relayUrl}`}
      scope={`${pubkey}:${relayUrl}`}
    >
      {children}
    </HostWatchScope>
  );
}
function HostWatchScope({
  scope,
  children,
}: {
  scope: string;
  children: React.ReactNode;
}) {
  const storageKey = `buzz-paseo-host-watch.v1:${scope}`;
  const [storedWatch, setWatch] = React.useState(() => readWatch(storageKey));
  const mountedAt = React.useRef(Date.now());
  const [now, setNow] = React.useState(Date.now);
  const query = usePresenceQuery([PASEO_HOST_PUBKEY]);
  React.useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 5_000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  // Avoid a false offline alert from an old disk cache before the first
  // presence read settles. A hung read cannot silence the local timer forever.
  const ready = query.isFetched || now - mountedAt.current > PASEO_STALE_MS;
  const sample = {
    status: query.isSuccess ? query.data?.[PASEO_HOST_PUBKEY] : undefined,
    observedAt: query.dataUpdatedAt,
  };
  const watch = ready
    ? advanceHostWatch(storedWatch, sample, now)
    : storedWatch;
  React.useEffect(() => {
    if (ready)
      setWatch((previous) =>
        advanceHostWatch(
          previous,
          {
            status: query.isSuccess
              ? query.data?.[PASEO_HOST_PUBKEY]
              : undefined,
            observedAt: query.dataUpdatedAt,
          },
          now,
        ),
      );
  }, [ready, query.isSuccess, query.data, query.dataUpdatedAt, now]);
  const previousOutage = React.useRef(watch.offlineSince);
  const announced = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(watch));
    } catch {
      /* Continue in memory when storage is unavailable. */
    }
    if (
      watch.offlineSince !== null &&
      announced.current !== watch.offlineSince
    ) {
      announced.current = watch.offlineSince;
      const body = hostOfflineText(watch.offlineSince);
      toast.warning(body, { id: `paseo-host-offline:${scope}` });
      // Existing native sender checks OS permission; never prompt on an outage.
      void sendDesktopNotification({ title: "Paseo host offline", body }).catch(
        () => false,
      );
    } else if (watch.offlineSince === null && previousOutage.current !== null) {
      toast.dismiss(`paseo-host-offline:${scope}`);
      toast.success(
        `Paseo back (offline ${hostTime(previousOutage.current)}–${hostTime(Date.now())})`,
      );
      announced.current = null;
    }
    previousOutage.current = watch.offlineSince;
  }, [watch, scope, storageKey, ready]);
  const health = React.useMemo(
    () => ({ offlineSince: ready ? watch.offlineSince : null }),
    [watch.offlineSince, ready],
  );
  return (
    <PaseoHostContext.Provider value={health}>
      {children}
    </PaseoHostContext.Provider>
  );
}
export function PaseoHostBanner() {
  const { offlineSince } = React.useContext(PaseoHostContext);
  if (offlineSince === null) return null;
  return (
    <div
      role="status"
      data-testid="paseo-host-offline"
      className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-foreground"
      title="Time of last fresh presence observed by this client, or when monitoring began. Host availability is inferred from presence; an interrupted network can also delay it."
    >
      {hostOfflineText(offlineSince)}
    </div>
  );
}

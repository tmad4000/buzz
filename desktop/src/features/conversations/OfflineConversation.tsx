import { offlineThreadIsAuthoritative } from "@/features/messages/lib/offlineThreadAuthority";
import { toast } from "sonner";
import { offlineConnectionEpoch } from "@/shared/api/offlineConnection";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineCacheEnabled } from "@/shared/api/offlineCache";
import { relayClient } from "@/shared/api/relayClient";
import {
  isRelayConnectionDegraded,
  useRelayConnection,
} from "@/shared/api/useRelayConnection";
import { ConversationLiveContext } from "./ConversationViewContext";

/** Scoped to one pane: a live sibling must never admit a cached conversation. */
export function OfflineConversation({
  channelId,
  children,
}: {
  channelId: string | null;
  children: React.ReactNode;
}) {
  const client = useQueryClient();
  const relay = useRelayConnection({ degradedAfterMs: 2000 });
  const [online, setOnline] = React.useState(() => navigator.onLine !== false);
  React.useEffect(() => {
    const update = () => {
      const next = navigator.onLine !== false;
      setOnline(next);
      if (next && offlineCacheEnabled() && channelId)
        void client.invalidateQueries({
          queryKey: ["channel-messages", channelId],
        });
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [client, channelId]);
  const snapshot = useQuery<{ savedAt: number; source: "cache" } | null>({
    queryKey: ["offline-snapshot", channelId],
    queryFn: () => null,
    enabled: false,
  });
  const [threadRevision, setThreadRevision] = React.useState(0);
  const [cachedThread, setCachedThread] = React.useState<{
    savedAt: number;
    truncated?: boolean;
  } | null>(null);
  React.useEffect(() => {
    const update = () => {
      const snapshots = client
        .getQueryCache()
        .findAll({ queryKey: ["thread-replies", channelId] })
        .filter((query) => query.getObserversCount() > 0)
        .map((query) =>
          client.getQueryData<{ savedAt: number; truncated?: boolean }>([
            "offline-source",
            ...query.queryKey,
          ]),
        )
        .filter(
          (value): value is { savedAt: number; truncated?: boolean } => !!value,
        );
      const next = snapshots.length
        ? {
            savedAt: Math.min(...snapshots.map((row) => row.savedAt)),
            truncated: snapshots.some((row) => row.truncated),
          }
        : null;
      setCachedThread((previous) =>
        previous?.savedAt === next?.savedAt &&
        previous?.truncated === next?.truncated
          ? previous
          : next,
      );
    };
    update();
    return client.getQueryCache().subscribe((event) => {
      if (
        event.query.queryKey[0] === "thread-replies" &&
        (event.type === "observerAdded" ||
          event.type === "observerRemoved" ||
          event.type === "removed" ||
          (event.type === "updated" &&
            (event.action.type === "success" || event.action.type === "error")))
      )
        setThreadRevision((value) => value + 1);
      update();
    });
  }, [client, channelId]);
  const enabled = offlineCacheEnabled();
  const liveFetch = useQuery<string>({
    queryKey: ["offline-live", channelId],
    queryFn: () => "",
    enabled: false,
  });

  const live = React.useCallback(() => {
    // These render signals intentionally refresh the reader identity. Authority
    // must still be reread from the current caches and connection at call time.
    void [
      snapshot.data,
      liveFetch.data,
      cachedThread,
      threadRevision,
      online,
      relay,
    ];
    return (
      !enabled ||
      (navigator.onLine !== false &&
        relayClient.getConnectionState() === "connected" &&
        client.getQueryData(["offline-live", channelId]) ===
          offlineConnectionEpoch() &&
        !client.getQueryData(["offline-snapshot", channelId]) &&
        !client
          .getQueryCache()
          .findAll({ queryKey: ["thread-replies", channelId] })
          .some(
            (query) =>
              query.getObserversCount() > 0 &&
              !offlineThreadIsAuthoritative(client, query),
          ))
    );
  }, [
    enabled,
    client,
    channelId,
    snapshot.data,
    liveFetch.data,
    cachedThread,
    threadRevision,
    online,
    relay,
  ]);
  const cachedAt = useQuery<{ savedAt: number }>({
    queryKey: ["offline-cached-at", channelId],
    queryFn: () => ({ savedAt: 0 }),
    enabled: false,
  });
  const liveNow = live();
  const visibleSnapshot = cachedThread ?? snapshot.data ?? cachedAt.data;
  const offline =
    enabled &&
    (!online ||
      ((relay === "connecting" || isRelayConnectionDegraded(relay)) &&
        !!visibleSnapshot));
  const refresh =
    enabled && online && relay === "connected" && !liveNow && !!visibleSnapshot;
  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    if (offline) wasOffline.current = true;
    else if (enabled && liveNow && wasOffline.current) {
      wasOffline.current = false;
      toast.success("Up to date", { duration: 4000 });
    }
  }, [offline, enabled, liveNow]);
  const retry = () => {
    void relayClient.resumeReconnect();
    void client.invalidateQueries({
      queryKey: ["channel-messages", channelId],
    });
  };
  return (
    <ConversationLiveContext.Provider value={live}>
      {offline || refresh ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm"
        >
          <span>
            {refresh
              ? "Back online · refreshing…"
              : visibleSnapshot
                ? `Offline · showing cached as of ${new Date(visibleSnapshot.savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Offline · nothing cached for this chat"}
          </span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}
      {enabled && cachedThread?.truncated ? (
        <p
          role="status"
          className="border-b px-4 py-2 text-sm text-muted-foreground"
        >
          Showing newest 200 cached replies. Earlier replies load when online.
        </p>
      ) : null}
      {children}
    </ConversationLiveContext.Provider>
  );
}

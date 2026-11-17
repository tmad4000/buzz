import * as React from "react";

import { relayClient } from "@/shared/api/relayClient";
import {
  MAX_CHANNEL_STAR_ENTRIES,
  boundStarStore,
  DEFAULT_STORE,
  mergeStores,
  readChannelStarsStore,
  starredChannelIdsFromStore,
  storageKey,
  writeChannelStarsStore,
  type ChannelStarEntry,
  type ChannelStarStore,
} from "./channelStarsStorage";
import { ChannelStarSyncManager } from "./channelStarsSync";
import type { RemoteStars } from "./channelStarsSync";
import { useStaleReaderRecovery } from "./useStaleReaderRecovery";

export function useChannelStars(
  pubkey: string | undefined,
  relayUrl?: string,
): {
  starredChannelIds: Set<string>;
  starChannel: (
    channelId: string | readonly string[],
  ) => undefined | Promise<boolean>;
  unstarChannel: (channelId: string) => void;
} {
  const [store, setStore] = React.useState<ChannelStarStore>(() => {
    if (!pubkey) {
      return DEFAULT_STORE;
    }
    return readChannelStarsStore(pubkey);
  });

  const managerRef = React.useRef<ChannelStarSyncManager | null>(null);
  const lastAppliedRemoteTs = React.useRef(0);
  const lastAppliedEventId = React.useRef("");
  // Local-mutation revision: incremented on every user edit so an in-flight
  // retry fetch that started before the edit is discarded at apply time.
  const localRevision = React.useRef(0);

  React.useEffect(() => {
    if (!pubkey || !relayUrl) {
      setStore(DEFAULT_STORE);
      lastAppliedRemoteTs.current = 0;
      lastAppliedEventId.current = "";
      return;
    }
    setStore(readChannelStarsStore(pubkey));
    lastAppliedRemoteTs.current = 0;
    lastAppliedEventId.current = "";
    managerRef.current = new ChannelStarSyncManager(pubkey, relayUrl);
    return () => {
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [pubkey, relayUrl]);

  React.useEffect(() => {
    if (!pubkey) {
      return;
    }
    const key = storageKey(pubkey);
    const handler = (e: StorageEvent) => {
      if (e.key !== key) {
        return;
      }
      setStore(readChannelStarsStore(pubkey));
    };
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("storage", handler);
    };
  }, [pubkey]);

  const applyRemote = React.useCallback(
    (remote: RemoteStars): ((prev: ChannelStarStore) => ChannelStarStore) => {
      return (prev) => {
        if (!pubkey) return prev;
        if (remote.createdAt < lastAppliedRemoteTs.current) return prev;
        if (
          remote.createdAt === lastAppliedRemoteTs.current &&
          remote.eventId >= lastAppliedEventId.current
        )
          return prev;
        managerRef.current?.cancelPendingStarPublish();
        let merged: ChannelStarStore;
        try {
          merged = mergeStores(
            prev,
            remote.store,
            managerRef.current?.isConverting(),
          );
        } catch {
          return prev;
        }
        if (!writeChannelStarsStore(pubkey, merged)) return prev;
        // Advance the applied head only after the cache write succeeds so a
        // failed write leaves the same head retryable on the next tick.
        lastAppliedRemoteTs.current = remote.createdAt;
        lastAppliedEventId.current = remote.eventId;
        return merged;
      };
    },
    [pubkey],
  );

  React.useEffect(() => {
    if (!pubkey || !relayUrl) return;
    let cancelled = false;
    const local = readChannelStarsStore(pubkey);
    void managerRef.current?.bootstrap(local).then((result) => {
      if (cancelled) return;
      if (result.action === "apply-remote") {
        setStore(applyRemote(result.data));
      }
      // "hold": seed already performed by bootstrap (if first-sync), or blocked.
    });
    return () => {
      cancelled = true;
    };
  }, [pubkey, relayUrl, applyRemote]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: relayUrl is intentional — rebinds subscription when the active relay changes even though it is not used inside the effect body directly (the manager via managerRef.current carries it)
  React.useEffect(() => {
    if (!pubkey) return;
    let unsub: (() => Promise<void>) | null = null;
    let cancelled = false;
    void managerRef.current
      ?.subscribeToStars((remote) => {
        if (cancelled) return;
        setStore(applyRemote(remote));
      })
      .then((dispose) => {
        if (cancelled) {
          void dispose();
        } else {
          unsub = dispose;
        }
      });
    return () => {
      cancelled = true;
      if (unsub) void unsub();
    };
  }, [pubkey, relayUrl, applyRemote]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: relayUrl is intentional — rebinds reconnect listener when the active relay changes (community switch) even though it is not referenced directly inside the effect body
  React.useEffect(() => {
    if (!pubkey) return;
    let cancelled = false;
    const unsub = relayClient.subscribeToReconnects(() => {
      void managerRef.current?.fetchRemoteStars().then((result) => {
        if (cancelled) return;
        if (result.status === "found") {
          setStore(applyRemote(result.data));
        }
        const pending = managerRef.current?.getPendingStarStore();
        if (pending) {
          managerRef.current?.publishStars(pending);
        }
      });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [pubkey, relayUrl, applyRemote]);

  // Retry effect: see useStaleReaderRecovery for full behavior contract.
  const retryFetch = React.useCallback(
    () => managerRef.current?.fetchRemoteStars(),
    [],
  );
  const retryHasPending = React.useCallback(
    () => managerRef.current?.getPendingStarStore() != null,
    [],
  );
  const retryGetRevision = React.useCallback(() => localRevision.current, []);
  const retryMakeUpdater = React.useCallback(
    (data: RemoteStars) => applyRemote(data),
    [applyRemote],
  );
  useStaleReaderRecovery({
    enabled: !!pubkey && !!relayUrl,
    fetch: retryFetch,
    hasPending: retryHasPending,
    getRevision: retryGetRevision,
    makeUpdater: retryMakeUpdater,
    setStore,
    pubkey,
    relayUrl,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: store.channels is the relevant dep — the outer store identity can change without channels changing (e.g., on reconnect writes)
  const starredChannelIds = React.useMemo(
    () => starredChannelIdsFromStore(store),
    [store.channels],
  );

  const setStarState = React.useCallback(
    (channelId: string | readonly string[], starred: boolean) => {
      if (!pubkey) return;
      const entry: ChannelStarEntry = {
        starred,
        updatedAt: Math.floor(Date.now() / 1000),
      };
      setStore((prev) => {
        const ids =
          typeof channelId === "string" ? [channelId] : [...new Set(channelId)];
        const allStars = new Set([...starredChannelIdsFromStore(prev), ...ids]);
        // A bulk conversion must not silently evict existing favorites.
        if (
          typeof channelId !== "string" &&
          allStars.size > MAX_CHANNEL_STAR_ENTRIES
        )
          return prev;
        const changed = Object.fromEntries(ids.map((id) => [id, entry]));
        const next = boundStarStore(
          { version: 1, channels: { ...prev.channels, ...changed } },
          typeof channelId === "string" ? channelId : [...allStars],
        );
        if (!writeChannelStarsStore(pubkey, next)) return prev;
        localRevision.current += 1;
        managerRef.current?.publishStars(next);
        return next;
      });
    },
    [pubkey],
  );

  const starChannel = React.useCallback(
    (channelId: string | readonly string[]): undefined | Promise<boolean> => {
      if (typeof channelId === "string") {
        setStarState(channelId, true);
        return undefined;
      }
      return (async () => {
        const manager = managerRef.current;
        if (!pubkey || !manager) return false;
        const prev = readChannelStarsStore(pubkey);
        const ids = [...new Set(channelId)];
        const allStars = new Set([...starredChannelIdsFromStore(prev), ...ids]);
        if (allStars.size > MAX_CHANNEL_STAR_ENTRIES) return false;
        const entry = {
          starred: true,
          updatedAt: Math.floor(Date.now() / 1000),
        };
        const next = boundStarStore(
          {
            version: 1,
            channels: {
              ...prev.channels,
              ...Object.fromEntries(ids.map((id) => [id, entry])),
            },
          },
          [...allStars],
        );
        if (!writeChannelStarsStore(pubkey, next)) return false;
        localRevision.current += 1;
        setStore(next);
        const confirmed = await manager.publishConversion(next);
        if (!confirmed || managerRef.current !== manager) return false;
        // The section journal remains the durable retry owner until this ACK.
        // Do not overwrite edits made while publication was in flight.
        setStore((current) => {
          try {
            const merged = mergeStores(current, confirmed, true);
            return writeChannelStarsStore(pubkey, merged) ? merged : current;
          } catch {
            return current;
          }
        });
        return ids.every((id) => confirmed.channels[id]?.starred);
      })();
    },
    [setStarState, pubkey],
  );
  const unstarChannel = React.useCallback(
    (channelId: string) => setStarState(channelId, false),
    [setStarState],
  );

  return {
    starredChannelIds,
    starChannel,
    unstarChannel,
  };
}

import { offlineProfileLabels } from "./offlineProfileLabels";
import { offlineHeadSnapshot } from "./offlineHeadSnapshot";
import type { ChannelWindowStore } from "./channelWindowStore";
import type { QueryClient } from "@tanstack/react-query";
import {
  loadOffline,
  offlineCacheEnabled,
  saveOffline,
  type OfflineScope,
  type OfflineKind,
  offlineScopeKey,
} from "@/shared/api/offlineCache";
import type { RelayEvent } from "@/shared/api/types";

/** Hydrate only disposable data; never seed read receipts or authoritative hashes. */
export async function hydrateOfflineQueries(
  client: QueryClient,
  scope: OfflineScope,
): Promise<void> {
  if (!offlineCacheEnabled()) return;
  const [row] = await loadOffline<unknown[]>(scope, "sidebar", "sidebar", 1);
  if (
    !row ||
    !Array.isArray(row.payload) ||
    client.getQueryData(["channels"]) !== undefined
  )
    return;
  client.setQueryData(["offline-source", "channels"], {
    savedAt: row.savedAt,
    source: "cache",
  });
  client.setQueryData(["channels"], row.payload, { updatedAt: 0 });
}
/** Successful query fetches only: observer-free thread prefetches are deliberately excluded. */
export function persistOfflineQueries(
  client: QueryClient,
  scope: OfflineScope,
): () => void {
  let batchEpoch = 0;
  const profileFingerprints = new Map<string, string>();
  const clearPending = (event: Event) => {
    if ((event as CustomEvent<string>).detail !== offlineScopeKey(scope))
      return;
    batchEpoch++;
    profileFingerprints.clear();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
  if (typeof window !== "undefined")
    window.addEventListener("buzz-offline-cache-cleared", clearPending);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const flush = (channelId: string) => {
    const store = client.getQueryData<ChannelWindowStore>([
      "channel-window",
      channelId,
    ]);
    if (!store || client.getQueryData(["offline-snapshot", channelId])) return;
    const active = client
      .getQueryCache()
      .find({ queryKey: ["channel-messages", channelId], exact: true })
      ?.getObserversCount();
    const events = offlineHeadSnapshot(store, channelId, active ? 100 : 50);
    const capturedAt = Date.now();
    if (events)
      void saveOffline(scope, "head", channelId, events)
        .then(() => {
          client.setQueryData(["offline-cached-at", channelId], {
            savedAt: capturedAt,
          });
        })
        .catch((error) => console.warn("Offline head write failed", error));
  };
  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (
      !offlineCacheEnabled() ||
      event.type !== "updated" ||
      event.action.type !== "success"
    )
      return;
    if (
      event.query.queryKey[0] === "channel-window" &&
      typeof event.query.queryKey[1] === "string"
    ) {
      const channelId = event.query.queryKey[1];
      if (timers.has(channelId)) clearTimeout(timers.get(channelId));
      timers.set(
        channelId,
        setTimeout(() => {
          timers.delete(channelId);
          flush(channelId);
        }, 2000),
      );
      return;
    }
    if (event.query.queryKey[0] === "users-batch" && !event.action.manual) {
      const profiles = (
        event.query.state.data as { profiles?: Record<string, unknown> }
      )?.profiles;
      if (profiles)
        void (async () => {
          const epoch = batchEpoch;
          for (const [pubkey, profile] of Object.entries(profiles).slice(
            0,
            2000,
          )) {
            if (epoch !== batchEpoch) return;
            const labels = offlineProfileLabels(profile);
            const fingerprint = JSON.stringify(labels);
            if (profileFingerprints.get(pubkey) === fingerprint) continue;
            await saveOffline(scope, "profile", pubkey, labels);
            profileFingerprints.delete(pubkey);
            profileFingerprints.set(pubkey, fingerprint);
            while (profileFingerprints.size > 2000)
              profileFingerprints.delete(
                profileFingerprints.keys().next().value as string,
              );
          }
        })().catch((error) =>
          console.warn("Offline profile write failed", error),
        );
      return;
    }
    if (
      event.action.manual &&
      !(
        event.query.queryKey[0] === "thread-replies" &&
        !client.getQueryData(["offline-source", ...event.query.queryKey])
      )
    )
      return;
    const query = event.query;
    const [type, channel, root] = query.queryKey;
    let kind: OfflineKind;
    let id: string;
    let payload = query.state.data;
    if (type === "channels" && query.queryKey.length === 1) {
      kind = "sidebar";
      id = "sidebar";
      client.setQueryData(["offline-source", "channels"], {
        savedAt: Date.now(),
      });
    } else if (type === "user-profile" && typeof channel === "string") {
      kind = "profile";
      id = channel;
      payload = offlineProfileLabels(payload);
    } else if (
      type === "thread-replies" &&
      typeof channel === "string" &&
      typeof root === "string" &&
      query.getObserversCount() > 0 &&
      Array.isArray(payload)
    ) {
      kind = "thread";
      id = JSON.stringify([channel, root]);
      payload = {
        events: payload.filter((event) => !event.pending).slice(-200),
        truncated: payload.length > 200,
      };
    } else return;
    if (kind !== "sidebar")
      client.removeQueries({
        queryKey: ["offline-source", ...query.queryKey],
        exact: true,
      });
    void saveOffline(scope, kind, id, payload).catch((error) =>
      console.warn("Offline snapshot write failed", error),
    );
  });
  return () => {
    unsubscribe();
    batchEpoch++;
    if (typeof window !== "undefined")
      window.removeEventListener("buzz-offline-cache-cleared", clearPending);
    for (const [channelId, timer] of timers) {
      clearTimeout(timer);
      flush(channelId);
    }
  };
}

/** Seed an opened thread before its live read, without converting a failed fetch into success. */
export async function hydrateOpenedThread(
  client: QueryClient,
  scope: OfflineScope,
  channelId: string,
  rootId: string,
): Promise<void> {
  const key = ["thread-replies", channelId, rootId];
  if (client.getQueryData(key) !== undefined) return;
  const [row] = await loadOffline<{ events: RelayEvent[]; truncated: boolean }>(
    scope,
    "thread",
    JSON.stringify([channelId, rootId]),
    1,
  );
  if (!row || client.getQueryData(key) !== undefined) return;
  client.setQueryData(["offline-source", ...key], {
    savedAt: row.savedAt,
    source: "cache",
    truncated: row.payload.truncated,
  });
  client.setQueryData(key, row.payload.events, { updatedAt: 0 });
}

/** Cached author labels remain presentation-only and never establish profile ownership. */
export async function hydrateOfflineProfiles(
  client: QueryClient,
  scope: OfflineScope,
  pubkeys: string[],
): Promise<void> {
  const wanted = new Set(pubkeys);
  const rows = await loadOffline<unknown>(scope, "profile", pubkeys);
  const profiles = Object.fromEntries(
    rows
      .filter((row) => wanted.has(row.id))
      .map((row) => [row.id, offlineProfileLabels(row.payload)]),
  );
  if (
    Object.keys(profiles).length &&
    client.getQueryData(["users-batch", ...pubkeys]) === undefined
  )
    client.setQueryData(
      ["users-batch", ...pubkeys],
      { profiles, missing: [] },
      { updatedAt: 0 },
    );
}

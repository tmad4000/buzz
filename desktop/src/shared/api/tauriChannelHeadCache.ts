import { invokeTauri } from "./tauri";
import {
  offlineCacheEnabled,
  clearOffline,
  loadOffline,
  saveOffline,
} from "./offlineCache";
import type { RelayEvent } from "@/shared/api/types";
export type ChannelHeadScope = { pubkey: string; relayUrl: string };
export type ChannelHeadEntry = {
  channelId: string;
  events: RelayEvent[];
  savedAt: number;
  lastVisitedAt: number;
};
export function loadChannelHeadCache(
  scope: ChannelHeadScope,
  limit = 12,
  channelId?: string,
): Promise<ChannelHeadEntry[]> {
  if (!offlineCacheEnabled())
    return invokeTauri<ChannelHeadEntry[]>("channel_head_cache_load", {
      scope,
      limit,
    }).then((rows) =>
      channelId ? rows.filter((row) => row.channelId === channelId) : rows,
    );
  return loadOffline<RelayEvent[]>(scope, "head", channelId, limit).then(
    (rows) =>
      rows.slice(0, limit).map((row) => ({
        channelId: row.id,
        events: row.payload,
        savedAt: row.savedAt,
        lastVisitedAt: row.savedAt,
      })),
  );
}
export function storeChannelHeadCache(
  scope: ChannelHeadScope,
  channelId: string,
  events: RelayEvent[],
): Promise<void> {
  if (!offlineCacheEnabled())
    return invokeTauri("channel_head_cache_store", {
      scope,
      channelId,
      events,
    });
  return saveOffline(scope, "head", channelId, events);
}
export function clearChannelHeadCache(scope: ChannelHeadScope): Promise<void> {
  if (!offlineCacheEnabled())
    return invokeTauri("channel_head_cache_clear", { scope });
  return clearOffline(scope);
}

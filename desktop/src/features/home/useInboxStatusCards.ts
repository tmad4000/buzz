import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HOME_FEED_LIMIT,
  HOME_FEED_REFETCH_INTERVAL_MS,
} from "@/features/home/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { discoverInboxActivity } from "@/features/home/lib/inboxStatusDiscovery";
import { fetchStructuralAuxForMessages } from "@/features/messages/lib/auxBackfill";
import { relayClient } from "@/shared/api/relayClient";
import { useRelayConnection } from "@/shared/api/useRelayConnection";
import { useFocusedRefetchInterval } from "@/shared/lib/useDocumentVisible";

/** The native Home feed has empty activity buckets; only these views need it. */
export function useInboxStatusCards(
  availableChannelIds: ReadonlySet<string>,
  currentPubkey: string | undefined,
  enabled: boolean,
) {
  const { activeCommunity } = useCommunities();
  const connection = useRelayConnection({ enabled, degradedAfterMs: 0 });
  const generation = relayClient.getConnectionGeneration();
  const connected =
    connection === "connected" &&
    relayClient.getConnectionState() === "connected";
  const channelIds = React.useMemo(
    () => (enabled ? [...availableChannelIds].sort() : []),
    [availableChannelIds, enabled],
  );
  const canLoad =
    enabled &&
    Boolean(activeCommunity) &&
    Boolean(currentPubkey) &&
    channelIds.length > 0;
  const refetchInterval = useFocusedRefetchInterval(
    canLoad && connected ? HOME_FEED_REFETCH_INTERVAL_MS : false,
  );
  const query = useQuery({
    queryKey: [
      "inbox-status-snapshots",
      activeCommunity?.relayUrl,
      generation,
      currentPubkey,
      channelIds,
    ],
    enabled: canLoad && connected,
    refetchInterval,
    refetchOnWindowFocus: false,
    staleTime: HOME_FEED_REFETCH_INTERVAL_MS,
    retry: false,
    queryFn: async () => {
      const result = await discoverInboxActivity({
        channelIds,
        currentPubkey: currentPubkey ?? "",
        limit: HOME_FEED_LIMIT,
        fetchEvents: (filter) => relayClient.fetchEvents(filter),
        fetchStructural: (cardIds) =>
          fetchStructuralAuxForMessages("", cardIds),
      });
      if (relayClient.getConnectionGeneration() !== generation) {
        throw new Error("Inbox relay session changed during discovery");
      }
      return result;
    },
  });
  const coverage = !enabled
    ? "confirmed"
    : !currentPubkey || !activeCommunity || !connected || query.isError
      ? "unavailable"
      : query.isFetching || (canLoad && !query.data)
        ? "syncing"
        : "confirmed";
  return {
    data: canLoad && connected ? query.data : undefined,
    coverage,
  } as const;
}

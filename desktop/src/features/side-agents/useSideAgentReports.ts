import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import type { Channel, RelayEvent } from "@/shared/api/types";
import { foldSideAgents, type SideAgentSource } from "./model";

/** Observe the community's loaded windows without adding a relay request. */
export function useSideAgentReports(channels: Channel[]) {
  const client = useQueryClient();
  const { subscribe, getSnapshot } = React.useMemo(() => {
    const cache = client.getQueryCache();
    const eligible = new Map(
      channels
        .filter((channel) => channel.isMember && !channel.archivedAt)
        .map((channel) => [channel.id, channel]),
    );
    const includesWindow = (key: readonly unknown[]) =>
      (key[0] === "channel-messages" || key[0] === "thread-replies") &&
      typeof key[1] === "string" &&
      eligible.has(key[1]);
    const predicate = ({ queryKey }: { queryKey: readonly unknown[] }) =>
      includesWindow(queryKey);
    let lastWindows: RelayEvent[][] = [];
    let snapshot: ReturnType<typeof foldSideAgents> = [];
    return {
      subscribe: (notify: () => void) =>
        cache.subscribe((event) => {
          if (
            (event.type === "added" ||
              event.type === "updated" ||
              event.type === "removed") &&
            includesWindow(event.query.queryKey)
          )
            notify();
        }),
      getSnapshot: () => {
        const sources = new Map<string, SideAgentSource>();
        const windows: RelayEvent[][] = [];
        for (const [key, events] of client.getQueriesData<RelayEvent[]>({
          predicate,
        })) {
          if (!Array.isArray(events) || !events.length) continue;
          const channelId = key[1] as string;
          const channel = eligible.get(channelId);
          if (!channel) continue;
          windows.push(events);
          const source = sources.get(channelId);
          if (source) source.windows.push(events);
          else sources.set(channelId, { channel, windows: [events] });
        }
        if (
          windows.length !== lastWindows.length ||
          windows.some((window, index) => window !== lastWindows[index])
        ) {
          lastWindows = windows;
          snapshot = foldSideAgents([...sources.values()]);
        }
        return snapshot;
      },
    };
  }, [channels, client]);
  return React.useSyncExternalStore(subscribe, getSnapshot);
}

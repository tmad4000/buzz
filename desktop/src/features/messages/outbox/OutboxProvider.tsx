import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { channelWindowKey } from "../lib/messageQueryKeys";
import {
  emptyChannelWindowStore,
  mergeLiveChannelWindowEvent,
  type ChannelWindowStore,
} from "../lib/channelWindowStore";
import { projectChannelWindowMessages } from "../lib/projectChannelWindow";
import { outboxSnapshot, startOutbox, subscribeOutbox } from "./runtime";
import type { OutboxRecord } from "./types";

const EMPTY: readonly OutboxRecord[] = [];
export function outboxRelayUrl(url: string): string {
  return url
    .trim()
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/+$/, "");
}
export const OutboxContext = React.createContext<{
  enabled: boolean;
  relayUrl?: string;
  signerPubkey?: string;
  rows: readonly OutboxRecord[];
}>({ enabled: false, rows: EMPTY });

/** The worker outlives channel panes, editor ownership and navigation. */
export function OutboxProvider({
  children,
  relayUrl,
  signerPubkey,
}: {
  children: React.ReactNode;
  relayUrl?: string;
  signerPubkey?: string;
}) {
  const queryClient = useQueryClient();
  const snapshot = React.useSyncExternalStore(
    subscribeOutbox,
    outboxSnapshot,
    () => EMPTY,
  );
  React.useEffect(
    () =>
      startOutbox((event, row) => {
        // Native publication is scope-fenced. Do not project an old community's
        // late acknowledgement into the new community's unscoped query caches.
        if (
          event.pubkey !== signerPubkey ||
          outboxRelayUrl(row.message.relayUrl) !==
            outboxRelayUrl(relayUrl ?? "")
        )
          return;
        const key = channelWindowKey(row.message.channelId);
        const current =
          queryClient.getQueryData<ChannelWindowStore>(key) ??
          emptyChannelWindowStore();
        queryClient.setQueryData(
          key,
          mergeLiveChannelWindowEvent(current, event),
        );
        projectChannelWindowMessages(queryClient, row.message.channelId);
      }),
    [queryClient, relayUrl, signerPubkey],
  );
  const scope = outboxRelayUrl(relayUrl ?? "");
  const rows = React.useMemo(
    () =>
      snapshot.filter(
        (row) =>
          row.message.signerPubkey === signerPubkey &&
          outboxRelayUrl(row.message.relayUrl) === scope,
      ),
    [snapshot, scope, signerPubkey],
  );
  const waiting = rows.filter((row) => !row.accepted).length;
  return (
    <OutboxContext.Provider
      value={{ enabled: true, relayUrl: scope, signerPubkey, rows }}
    >
      {children}
      {waiting > 0 ? (
        <div
          role="status"
          className="fixed right-4 top-12 z-50 rounded-full border bg-background px-3 py-1 text-xs shadow-sm"
        >
          {waiting} waiting to send
        </div>
      ) : null}
    </OutboxContext.Provider>
  );
}

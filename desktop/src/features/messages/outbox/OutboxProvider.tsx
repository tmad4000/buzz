import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  projectAcceptedOutboxEvent,
  projectPendingOutboxRows,
} from "./projection";
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
  // These caches are unscoped. Fence even a queued callback from the previous
  // effect against the currently rendered relay/account/query-client owner.
  const active = React.useRef({ queryClient, relayUrl, signerPubkey });
  active.current = { queryClient, relayUrl, signerPubkey };
  React.useLayoutEffect(() => {
    const inScope = (row: OutboxRecord) =>
      active.current.queryClient === queryClient &&
      row.message.signerPubkey === active.current.signerPubkey &&
      outboxRelayUrl(row.message.relayUrl) ===
        outboxRelayUrl(active.current.relayUrl ?? "");
    return startOutbox(
      (event, row) => {
        if (!inScope(row) || event.pubkey !== row.message.signerPubkey) return;
        projectAcceptedOutboxEvent(queryClient, event, row);
      },
      (row) => {
        if (!inScope(row)) return;
        projectPendingOutboxRows(queryClient, outboxSnapshot().filter(inScope));
      },
    );
  }, [queryClient]);
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
  React.useLayoutEffect(() => {
    projectPendingOutboxRows(queryClient, rows);
  }, [queryClient, rows]);
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

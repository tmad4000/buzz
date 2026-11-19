import {
  hashKey,
  type Query,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { offlineCacheEnabled } from "@/shared/api/offlineCache";
import {
  offlineConnectionEpoch,
  offlineNeedsConnection,
} from "@/shared/api/offlineConnection";
import { OfflineReadUnavailableError } from "@/shared/api/offlineRead";
import type { RelayEvent } from "@/shared/api/types";

type Proof = {
  epoch: string;
  signal?: AbortSignal;
  result?: RelayEvent[];
  data?: unknown;
};
const states = new WeakMap<
  QueryClient,
  { pending: Map<string, Proof>; committed: Map<string, Proof> }
>();
function stateFor(client: QueryClient) {
  let state = states.get(client);
  if (state) return state;
  state = { pending: new Map(), committed: new Map() };
  states.set(client, state);
  const stateRef = state;
  client.getQueryCache().subscribe((event) => {
    if (event.query.queryKey[0] !== "thread-replies") return;
    const key = hashKey(event.query.queryKey);
    if (event.type === "removed") {
      stateRef.pending.delete(key);
      stateRef.committed.delete(key);
      return;
    }
    if (event.type !== "updated" || event.action.type !== "success") return;
    const prior = stateRef.committed.get(key);
    if (event.action.manual) {
      // Committed live socket patches may retain authority within the same connection.
      if (
        prior &&
        prior.epoch === offlineConnectionEpoch() &&
        !prior.signal?.aborted &&
        !offlineNeedsConnection()
      )
        stateRef.committed.set(key, { ...prior, data: event.query.state.data });
      return;
    }
    const proof = stateRef.pending.get(key);
    if (
      !proof?.result ||
      proof.signal?.aborted ||
      proof.epoch !== offlineConnectionEpoch() ||
      offlineNeedsConnection() ||
      !Array.isArray(event.query.state.data)
    )
      return;
    // React Query can structurally share an unchanged response with the old array.
    // Only a successful data commit matching the completed response establishes proof.
    if (hashKey(event.query.state.data) !== hashKey(proof.result)) return;
    stateRef.committed.set(key, { ...proof, data: event.query.state.data });
    client.removeQueries({
      queryKey: ["offline-source", ...event.query.queryKey],
      exact: true,
    });
  });
  return state;
}
export function beginOfflineThreadRead(
  client: QueryClient,
  key: QueryKey,
  signal?: AbortSignal,
) {
  if (!offlineCacheEnabled()) return (_result: RelayEvent[]) => {};
  const state = stateFor(client);
  const id = hashKey(key);
  const proof: Proof = { epoch: offlineConnectionEpoch(), signal };
  state.pending.set(id, proof);
  return (result: RelayEvent[]) => {
    if (
      signal?.aborted ||
      state.pending.get(id) !== proof ||
      proof.epoch !== offlineConnectionEpoch() ||
      offlineNeedsConnection()
    )
      throw new OfflineReadUnavailableError(
        "Thread read superseded; refresh on the current connection",
      );
    proof.result = result;
  };
}
export function offlineThreadIsAuthoritative(
  client: QueryClient,
  query: Query,
): boolean {
  if (!offlineCacheEnabled()) return true;
  const proof = states.get(client)?.committed.get(hashKey(query.queryKey));
  return (
    !!proof &&
    proof.data === query.state.data &&
    proof.epoch === offlineConnectionEpoch() &&
    !proof.signal?.aborted &&
    !offlineNeedsConnection()
  );
}

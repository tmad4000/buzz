import * as React from "react";
import { ReadStateManager } from "@/features/channels/readState/readStateManager";
import { ContextParentRegistry } from "./contextParentRegistry";
import type { RelayClient } from "@/shared/api/relayClientSession";

const noopGetTimestamp = () => null;
const noopMarkRead = () => {};
const noopDrainAdvances = (): ReadonlySet<string> => new Set<string>();
const noopRegisterParents = () => () => {};

/**
 * React hook that creates and manages a ReadStateManager instance.
 * Returns no-op functions when pubkey or relayClient are not available.
 */
export function useReadState(
  pubkey: string | undefined,
  relayClient: RelayClient | undefined,
) {
  const [readStateVersion, forceUpdate] = React.useReducer(
    (x: number) => x + 1,
    0,
  );
  const [initializedPubkey, setInitializedPubkey] = React.useState<
    string | null
  >(null);
  const managerRef = React.useRef<ReadStateManager | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: discard the graph on identity/relay changes.
  const parents = React.useMemo(
    () => new ContextParentRegistry(),
    [pubkey, relayClient],
  );

  // Create/destroy manager when pubkey becomes available/changes
  React.useEffect(() => {
    setInitializedPubkey(null);
    if (!pubkey || !relayClient) return;

    let isCancelled = false;
    const manager = new ReadStateManager(pubkey, relayClient);
    manager.setContextParentResolver(parents.resolve);
    managerRef.current = manager;

    const unsubscribe = manager.subscribe(() => {
      forceUpdate();
    });

    void manager.initialize().finally(() => {
      if (!isCancelled) {
        setInitializedPubkey(pubkey);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
      manager.destroy();
      managerRef.current = null;
    };
  }, [pubkey, relayClient, parents]);

  const getEffectiveTimestamp = React.useCallback(
    (contextId: string): number | null => {
      return managerRef.current?.getEffectiveTimestamp(contextId) ?? null;
    },
    [],
  );

  const getOwnTimestamp = React.useCallback(
    (contextId: string): number | null => {
      return managerRef.current?.getOwnTimestamp(contextId) ?? null;
    },
    [],
  );

  const markContextRead = React.useCallback(
    (contextId: string, unixTimestamp: number): void => {
      managerRef.current?.markContextRead(contextId, unixTimestamp);
    },
    [],
  );

  const seedContextRead = React.useCallback(
    (contextId: string, unixTimestamp: number): void => {
      managerRef.current?.seedContextRead(contextId, unixTimestamp);
    },
    [],
  );

  const drainSyncedAdvances = React.useCallback((): ReadonlySet<string> => {
    return managerRef.current?.drainSyncedAdvances() ?? new Set<string>();
  }, []);

  const registerContextParents = React.useCallback(
    (entries: ReadonlyMap<string, string>) => {
      const release = parents.register(entries);
      if (entries.size) forceUpdate();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
        if (entries.size) forceUpdate();
      };
    },
    [parents],
  );

  const isReady = Boolean(
    pubkey && relayClient && initializedPubkey === pubkey,
  );

  if (!pubkey || !relayClient) {
    return {
      getEffectiveTimestamp: noopGetTimestamp,
      isReady: false,
      markContextRead: noopMarkRead,
      seedContextRead: noopMarkRead,
      drainSyncedAdvances: noopDrainAdvances,
      registerContextParents: noopRegisterParents,
      readStateVersion: 0,
      getOwnTimestamp: noopGetTimestamp,
    };
  }

  return {
    getEffectiveTimestamp,
    isReady,
    markContextRead,
    seedContextRead,
    drainSyncedAdvances,
    registerContextParents,
    readStateVersion,
    getOwnTimestamp,
  };
}

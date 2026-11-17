import * as React from "react";
import { relayClient } from "@/shared/api/relayClient";
import { getThreadReplies, signRelayEvent } from "@/shared/api/tauri";
import { getChannelMembers } from "@/shared/api/tauriChannels";
import {
  isThreadLinkCandidate,
  type ThreadLinkAnnotation,
  type ThreadLinkScope,
} from "./lib/threadLinks";
import {
  loadThreadLinkSnapshot,
  type ThreadLinkSnapshot,
} from "./lib/threadLinkLoader";
import type { ThreadLinkProjection } from "./lib/threadLinkProjection";
import { runThreadLinkWorker } from "./lib/threadLinkWorkerClient";
import {
  undoThreadLink,
  type ThreadLinkUndoRecord,
} from "./lib/threadLinkUndo";
import {
  loadThreadLinkUndo,
  pendingThreadLinkUndos,
  saveThreadLinkUndo,
  threadLinkUndoKey,
} from "./lib/threadLinkUndoStorage";

export type ThreadLinkRuntime = {
  load: (
    scope: ThreadLinkScope,
    signal: AbortSignal,
    current: () => boolean,
  ) => Promise<ThreadLinkSnapshot>;
  subscribe: typeof relayClient.subscribeToChannelLive;
  reconnect: typeof relayClient.subscribeToReconnects;
  revoke: typeof relayClient.subscribeToChannelAccessRevocations;
};
const runtime: ThreadLinkRuntime = {
  load: (scope, signal, current) =>
    loadThreadLinkSnapshot(scope, {
      fetch: (filter) => relayClient.fetchEvents(filter),
      replies: (root, channel, cursor) =>
        getThreadReplies(root, channel, {
          limit: 200,
          depthLimit: 100,
          cursor,
        }),
      parse: (annotations, scope) =>
        runThreadLinkWorker<ThreadLinkAnnotation[]>(
          { type: "parse", annotations, scope },
          signal,
        ),
      project: (input) =>
        runThreadLinkWorker<ThreadLinkProjection>(
          { type: "project", ...input },
          signal,
        ),
      isCurrent: current,
    }),
  subscribe: (channel, callback) =>
    relayClient.subscribeToChannelLive(channel, callback),
  reconnect: (callback) => relayClient.subscribeToReconnects(callback),
  revoke: (callback) =>
    relayClient.subscribeToChannelAccessRevocations(callback),
};
const EMPTY_REJECTED: ReadonlySet<string> = new Set();
type State = {
  key: string | null;
  snapshot: ThreadLinkSnapshot | null;
  loading: boolean;
  error: string | null;
};

/** One mounted scope owns all requests/workers; nothing is cached across identities. */
export function useChannelThreadLinks(
  scope: ThreadLinkScope | null,
  scopeKey: string | null,
  identity: string | undefined,
  api = runtime,
) {
  const [state, setState] = React.useState<State>({
    key: null,
    snapshot: null,
    loading: false,
    error: null,
  });
  const [verdicts, setVerdicts] = React.useState<{
    key: string | null;
    rejected: ReadonlySet<string>;
  }>({ key: null, rejected: new Set() });
  const [undoError, setUndoError] = React.useState<string | null>(null);
  const [undoBusy, setUndoBusy] = React.useState(false);
  const [pending, setPending] = React.useState<ThreadLinkUndoRecord[]>([]);
  const active = React.useRef<string | null>(scopeKey);
  React.useLayoutEffect(() => {
    active.current = scopeKey;
    return () => {
      active.current = null;
    };
  }, [scopeKey]);
  const request = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    setVerdicts({ key: scopeKey, rejected: new Set() });
    setUndoError(null);
    setUndoBusy(false);
    setPending([]);
    if (!scope || !scopeKey) {
      setState({ key: null, snapshot: null, loading: false, error: null });
      return;
    }
    let disposed = false;
    let version = 0;
    let running = false;
    let dirty = false;
    let hasLinks = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    const controllers = new Set<AbortController>();
    const current = () => !disposed && active.current === scopeKey;
    const refreshReceipts = () => {
      try {
        if (current()) setPending(pendingThreadLinkUndos(scopeKey));
      } catch {
        if (current())
          setUndoError(
            "A saved undo receipt needs inspection; no change was sent",
          );
      }
    };
    const load = async () => {
      if (running || !current()) return;
      running = true;
      do {
        const started = version;
        dirty = false;
        const controller = new AbortController();
        controllers.add(controller);
        const owns = () => current() && started === version;
        setState((previous) => ({
          key: scopeKey,
          snapshot: previous.key === scopeKey ? previous.snapshot : null,
          loading: true,
          error: null,
        }));
        try {
          const snapshot = await api.load(scope, controller.signal, owns);
          if (owns()) {
            hasLinks = snapshot.annotations.length > 0;
            setVerdicts({
              key: scopeKey,
              rejected: new Set([
                ...snapshot.projection.decisions
                  .filter(
                    (decision) =>
                      decision.state === "rejected" && decision.annotationId,
                  )
                  .map((decision) => decision.annotationId as string),
              ]),
            });
            setState({ key: scopeKey, snapshot, loading: false, error: null });
          }
        } catch {
          if (owns())
            setState({
              key: scopeKey,
              snapshot: null,
              loading: false,
              error:
                "Thread organization is unavailable. Showing original positions; reply counts describe loaded native messages.",
            });
        } finally {
          controllers.delete(controller);
        }
        if (!current() || (started === version && !dirty)) break;
      } while (current());
      running = false;
      refreshReceipts();
    };
    const invalidate = () => {
      if (!current()) return;
      version++;
      for (const controller of controllers) controller.abort();
      setState({ key: scopeKey, snapshot: null, loading: true, error: null });
      void load();
    };
    request.current = invalidate;
    const offReconnect = api.reconnect(invalidate);
    const offRevoke = api.revoke(invalidate);
    refreshReceipts();
    // Subscribe BEFORE backfill; overlapping receipts deduplicate by signed ID.
    void api
      .subscribe(scope.channelId, (event) => {
        if (!current()) return;
        if (isThreadLinkCandidate(event)) invalidate();
        else if (hasLinks && event.kind !== 39005) {
          // Coalesce streaming bursts; no cryptography runs in the UI thread.
          dirty = true;
          if (running || refreshTimer) return;
          refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void load();
          }, 250);
        }
      })
      .then((stop) => {
        if (!current()) {
          stop();
          return;
        }
        unsubscribe = stop;
        void load();
      })
      .catch(() => {
        if (current())
          setState({
            key: scopeKey,
            snapshot: null,
            loading: false,
            error:
              "Thread organization live updates are unavailable. Showing original positions.",
          });
      });
    return () => {
      disposed = true;
      clearTimeout(refreshTimer);
      for (const controller of controllers) controller.abort();
      unsubscribe?.();
      offReconnect();
      offRevoke();
    };
  }, [scopeKey, scope, api]);
  const undo = React.useCallback(
    async (childId: string, previousId: string) => {
      if (!scope || !scopeKey || !identity || active.current !== scopeKey)
        return;
      const current = () => active.current === scopeKey;
      setUndoBusy(true);
      setUndoError(null);
      const controller = new AbortController();
      try {
        if (!navigator.locks)
          throw Error(
            "Undo requires a browser with cross-window locking; use the author CLI instead",
          );
        await navigator.locks.request(
          `buzz-thread-undo:${scopeKey}:${childId}`,
          async () => {
            const key = threadLinkUndoKey(scopeKey, childId, previousId);
            await undoThreadLink(
              { scope, scopeKey, identity, childId, previousId },
              {
                current,
                load: () => api.load(scope, controller.signal, current),
                member: async () =>
                  (
                    await getChannelMembers(scope.channelId, {
                      readYourWrites: true,
                    })
                  ).some((member) => member.pubkey === identity),
                sign: signRelayEvent,
                publish: (event) =>
                  relayClient.publishEvent(
                    event,
                    "Undo acknowledgment timed out",
                    "Undo could not be sent",
                    current,
                  ),
                read: () => loadThreadLinkUndo(key),
                save: (record) => saveThreadLinkUndo(key, record),
              },
            );
          },
        );
      } catch (error) {
        if (current())
          setUndoError(
            error instanceof Error
              ? error.message
              : "Undo could not be verified",
          );
      } finally {
        controller.abort();
        if (current()) {
          setUndoBusy(false);
          try {
            setPending(pendingThreadLinkUndos(scopeKey));
          } catch {
            /* Receipt error is already visible. */
          }
          request.current();
        }
      }
    },
    [scope, scopeKey, identity, api],
  );
  const view =
    state.key === scopeKey
      ? state
      : { snapshot: null, loading: !!scope, error: null };
  return {
    ...view,
    identity,
    rejectedIds: verdicts.key === scopeKey ? verdicts.rejected : EMPTY_REJECTED,
    undo,
    undoBusy: state.key === scopeKey && undoBusy,
    undoError: state.key === scopeKey ? undoError : null,
    pending: state.key === scopeKey ? pending : [],
    refresh: () => request.current(),
  };
}
export type ChannelThreadLinks = ReturnType<typeof useChannelThreadLinks>;

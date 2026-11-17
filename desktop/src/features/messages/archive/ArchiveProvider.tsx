import { excludeArchivedReplies } from "./unseen";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { relayClient } from "@/shared/api/relayClient";
import type { Channel } from "@/shared/api/types";

import type { TimelineMessage } from "../types";
import { loadThreadReplies } from "../useThreadReplies";
import { ArchiveEngine, type ArchiveUndo } from "./engine";
import {
  archiveKey,
  ARCHIVE_REPLY_KINDS,
  isArchiveReply,
  type ArchiveTarget,
} from "./model";

const empty = {
  revision: 0,
  ready: false,
  records: new Map<string, ArchiveTarget>(),
};
const noopSubscribe = () => () => {};
const emptyGet = () => empty;
export type ArchiveApi = {
  enabled: boolean;
  canArchive: (channelId: string) => boolean;
  ready: boolean;
  revision: number;
  records: ReadonlyMap<string, ArchiveTarget>;
  filterUnarchived: (
    messages: TimelineMessage[],
    rootId?: string,
  ) => TimelineMessage[];
  isArchived: (
    channelId: string,
    id: string,
    rootId?: string | null,
  ) => boolean;
  showArchived: (channelId: string) => boolean;
  setShowArchived: (channelId: string, show: boolean) => void;
  toggle: (
    channelId: string,
    message: Pick<TimelineMessage, "id" | "rootId">,
    kind?: "message" | "thread",
  ) => void;
  restore: (entry: ArchiveTarget) => void;
};
const ArchiveContext = React.createContext<ArchiveApi>({
  ...empty,
  ready: true, // Isolated consumers without the AppShell provider retain existing behavior.
  enabled: false,
  filterUnarchived: (messages) => messages,
  canArchive: () => false,
  isArchived: () => false,
  showArchived: () => false,
  setShowArchived: () => {},
  toggle: () => {},
  restore: () => {},
});
export const useArchive = () => React.useContext(ArchiveContext);

export function ArchiveProvider({
  pubkey,
  relayUrl,
  channels,
  children,
}: {
  pubkey?: string;
  relayUrl?: string;
  channels: Channel[];
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [engine, setEngine] = React.useState<ArchiveEngine | null>(null);
  // Construct/subscribe after commit. StrictMode never leaks a discarded engine.
  React.useEffect(() => {
    if (!pubkey || !relayUrl) {
      setEngine(null);
      return;
    }
    const owner = new ArchiveEngine(pubkey, relayUrl);
    setEngine(owner);
    void owner.start();
    return () => owner.destroy();
  }, [pubkey, relayUrl]);
  // Never expose a stale account's records/actions during the switch commit.
  const current =
    engine?.pubkey === pubkey && engine?.relayUrl === relayUrl ? engine : null;
  const snapshot = React.useSyncExternalStore(
    current?.subscribe ?? noopSubscribe,
    current?.get ?? emptyGet,
  );
  const membershipKey = JSON.stringify(
    channels
      .filter((channel) => channel.isMember)
      .map((channel) => channel.id)
      .sort(),
  );
  const allowed = React.useMemo(
    () => new Set<string>(JSON.parse(membershipKey)),
    [membershipKey],
  );
  const admission = React.useRef<{
    owner: ArchiveEngine | null;
    allowed: ReadonlySet<string>;
  } | null>(null);
  React.useLayoutEffect(() => {
    admission.current = { owner: current, allowed };
    return () => {
      admission.current = null;
    };
  }, [current, allowed]);
  const replyReads = React.useRef(new Map<string, Promise<string[]>>());
  const readIds = React.useCallback(
    (channelId: string, rootId: string) => {
      const key = `${pubkey}:${relayUrl}:${channelId}:${rootId}`;
      let pending = replyReads.current.get(key);
      if (!pending) {
        pending = loadThreadReplies(queryClient, channelId, rootId).then(
          (events) =>
            events
              .filter((event) => isArchiveReply(event, channelId, rootId))
              .map((event) => event.id),
        );
        replyReads.current.set(key, pending);
        void pending
          .finally(() => replyReads.current.delete(key))
          .catch(() => {});
      }
      return pending;
    },
    [pubkey, relayUrl, queryClient],
  );
  // New live replies and offline catch-up use identity, not author clocks or reads.
  React.useEffect(() => {
    if (!current || !snapshot.ready || !allowed.size) return;
    let alive = true;
    let dispose: (() => void | Promise<void>) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let checking = false;
    const check = async () => {
      if (checking || !alive) return;
      checking = true;
      const targets = [...current.get().records.entries()].filter(
        ([, entry]) => entry.kind === "thread" && allowed.has(entry.channelId),
      );
      // Two paged requests at a time, shared with explicit archive actions.
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(2, targets.length) }, async () => {
          while (alive && index < targets.length) {
            const [key, entry] = targets[index++];
            try {
              const ids = await readIds(entry.channelId, entry.rootId);
              if (
                alive &&
                current.get().records.get(key) === entry &&
                ids.some((id) => !entry.replyIds?.includes(id))
              )
                current.set(key, null);
            } catch {
              /* Retain archive on incomplete/failed history; retry below. */
            }
          }
        }),
      );
      checking = false;
    };
    const connect = async () => {
      try {
        const close = await relayClient.subscribeLive(
          {
            kinds: ARCHIVE_REPLY_KINDS,
            "#h": [...allowed],
            limit: 0,
          },
          (event) => {
            if (alive) {
              try {
                current.observeLive(event);
              } catch {
                /* Capacity errors retain state; catch-up retries. */
              }
            }
          },
        );
        if (!alive) {
          await close();
          return;
        }
        dispose = close;
        void check();
      } catch {
        if (alive)
          retry = setTimeout(() => {
            void connect();
          }, 15_000);
      }
    };
    void connect();
    const reconnect = relayClient.subscribeToReconnects(() => {
      void check();
    });
    const interval = setInterval(() => {
      void check();
    }, 60_000);
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      clearInterval(interval);
      void dispose?.();
      reconnect();
    };
  }, [current, snapshot.ready, allowed, readIds]);
  const notify = React.useCallback(
    (owner: ArchiveEngine, token: ArchiveUndo, text: string) => {
      toast(token.durable ? text : `${text} · device save pending`, {
        action: {
          label: "Undo",
          onClick: () => {
            try {
              if (!owner.undo(token))
                toast("Archive changed elsewhere; Undo was skipped");
            } catch (error) {
              toast.error(String(error));
            }
          },
        },
      });
    },
    [],
  );
  const value = React.useMemo<ArchiveApi>(
    () => ({
      enabled: Boolean(current),
      canArchive: (channelId) => Boolean(current && allowed.has(channelId)),
      ready: snapshot.ready,
      revision: snapshot.revision,
      records: snapshot.records,
      filterUnarchived: (messages, rootId) => {
        const live = current?.get();
        return live?.ready
          ? excludeArchivedReplies(messages, live.records, rootId)
          : [];
      },
      isArchived: (channelId, id, rootId) =>
        current?.isArchived(channelId, id, rootId) ?? false,
      showArchived: (channelId) => current?.showArchived(channelId) ?? false,
      setShowArchived: (channelId, show) => {
        if (allowed.has(channelId)) current?.setShowArchived(channelId, show);
      },
      restore: (entry) => {
        if (!current || !allowed.has(entry.channelId)) return;
        try {
          notify(
            current,
            current.set(archiveKey(entry.kind, entry.targetId), null),
            "Unarchived",
          );
        } catch (error) {
          toast.error(String(error));
        }
      },
      toggle: (channelId, message, kind = "message") => {
        if (!current || !allowed.has(channelId)) return;
        const owner = current,
          rootId = message.rootId ?? message.id;
        const targetId = kind === "thread" ? rootId : message.id;
        const key = archiveKey(kind, targetId);
        const before = owner.get().records.get(key);
        if (before) {
          try {
            notify(owner, owner.set(key, null), "Unarchived");
          } catch (error) {
            toast.error(String(error));
          }
          return;
        }
        const commit = (replyIds?: string[]) => {
          if (
            admission.current?.owner !== owner ||
            !admission.current.allowed.has(channelId)
          )
            throw new Error("Channel access changed; archive was not applied");
          notify(
            owner,
            owner.set(key, {
              channelId,
              rootId,
              targetId,
              kind,
              archivedAt: Date.now(),
              ...(replyIds ? { replyIds } : {}),
            }),
            kind === "thread"
              ? "Thread archived for you"
              : "Message archived for you",
          );
        };
        if (kind === "thread")
          void readIds(channelId, rootId)
            .then(commit)
            .catch((error) =>
              toast.error(`Could not archive thread: ${String(error)}`),
            );
        else
          try {
            commit();
          } catch (error) {
            toast.error(String(error));
          }
      },
    }),
    [current, snapshot, allowed, readIds, notify],
  );
  return (
    <ArchiveContext.Provider value={value}>{children}</ArchiveContext.Provider>
  );
}

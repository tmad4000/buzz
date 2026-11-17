import * as React from "react";
import type { TimelineMessage } from "../types";
import type { MainTimelineEntry } from "../lib/threadPanel";
import { completeThreadAncestors } from "../lib/unreadSidebar";
import {
  orderedSidebarReplies,
  projectEarlierReplyRuns,
  type EarlierReplyRun,
} from "./sidebarOpeningPolicy";

type Visit = {
  scope: string;
  known: Set<string>;
  retained: Set<string>;
  target: string | null | undefined;
  positioned: boolean;
  initialized: boolean;
  openRuns: Map<string, EarlierReplyRun>;
  folded: Set<string>;
};
const empty = (scope: string): Visit => ({
  scope,
  known: new Set(),
  retained: new Set(),
  target: undefined,
  positioned: false,
  initialized: false,
  openRuns: new Map(),
  folded: new Set(),
});
/** View-local opening defaults. Observation authority stays in the shared read manager. */
export function useSidebarOpening({
  enabled,
  scope,
  root,
  messages,
  reader,
  ready,
  complete,
  seenAt,
  explicitTarget,
}: {
  enabled: boolean;
  scope: string;
  root: string | null;
  messages: TimelineMessage[];
  reader?: string;
  ready: boolean;
  complete: boolean;
  seenAt: (root: string, id: string) => number | null;
  explicitTarget: string | null;
}) {
  const [saved, setSaved] = React.useState(() => empty(scope));
  const previous = saved.scope === scope ? saved : empty(scope);
  const ordered = React.useMemo(
    () => orderedSidebarReplies(messages, root),
    [messages, root],
  );
  const byId = React.useMemo(
    () => new Map(messages.map((m) => [m.id, m])),
    [messages],
  );
  const key = (m: TimelineMessage) => m.renderKey ?? m.id;
  const isSeen = (m: TimelineMessage) =>
    Boolean(root && ready && (seenAt(root, m.id) ?? -1) >= m.createdAt);
  const unseen = ordered.filter(
    (m) => !m.pending && m.pubkey !== reader && !isSeen(m),
  );
  const dataReady = complete || previous.initialized;
  const known = new Set(previous.known);
  const retained = new Set(previous.retained);
  const fresh = new Set<string>();
  if (enabled) {
    for (const message of ordered) {
      if (
        ready &&
        dataReady &&
        previous.initialized &&
        !previous.known.has(key(message)) &&
        previous.known.size &&
        unseen.some((m) => m.id === message.id)
      )
        fresh.add(message.id);
      if (completeThreadAncestors(byId, root, message.id))
        known.add(key(message));
    }
    const required =
      ready && dataReady
        ? [
            ordered[0],
            ordered.at(-1),
            ...unseen,
            ...ordered.filter((m) => m.pubkey === reader),
          ]
        : [];
    if (explicitTarget) required.push(byId.get(explicitTarget));
    for (const message of required) {
      if (!message) continue;
      const parents = completeThreadAncestors(byId, root, message.id);
      if (!parents) continue;
      retained.add(key(message));
      for (const id of parents) {
        const parent = byId.get(id);
        if (parent) retained.add(key(parent));
      }
    }
  }
  const target =
    previous.target === undefined && ready && dataReady
      ? unseen[0]
        ? key(unseen[0])
        : ordered.at(-1)
          ? key(ordered.at(-1)!)
          : null
      : previous.target;
  const changed =
    known.size !== previous.known.size ||
    retained.size !== previous.retained.size ||
    target !== previous.target ||
    (ready && dataReady && !previous.initialized);
  const visit = changed
    ? { ...previous, known, retained, target, initialized: ready && dataReady }
    : previous;
  const live = React.useRef(visit);
  React.useLayoutEffect(() => {
    live.current = visit;
    if (enabled && visit !== saved) setSaved(visit);
  }, [enabled, visit, saved]);
  const update = (change: (v: Visit) => Visit) => {
    const next = change(live.current);
    live.current = next;
    setSaved(next);
  };
  const openingTarget =
    enabled && !visit.positioned
      ? (explicitTarget ?? ordered.find((m) => key(m) === target)?.id ?? null)
      : null;
  const project = (entries: MainTimelineEntry[]) => {
    if (!enabled || !ready || !dataReady)
      return {
        entries,
        runs: new Map<string, EarlierReplyRun>(),
        openStarts: new Map<string, EarlierReplyRun>(),
      };
    const openKeys = new Set(
      [...visit.openRuns.values()].flatMap((run) => run.keys),
    );
    const projection = projectEarlierReplyRuns(
      entries,
      (m) =>
        isSeen(m) &&
        (!retained.has(key(m)) || visit.folded.has(key(m))) &&
        !openKeys.has(key(m)),
    );
    const openStarts = new Map(
      [...visit.openRuns.values()]
        .filter((run) => entries.some((e) => e.message.id === run.id))
        .map((run) => [run.id, run]),
    );
    return { ...projection, openStarts };
  };
  return {
    fresh,
    project,
    openingTarget,
    firstUnseen: ready && dataReady ? unseen[0]?.id : undefined,
    readyToPosition: !enabled || (ready && dataReady),
    positionDone: () =>
      update((v) => (v.positioned ? v : { ...v, positioned: true })),
    retain: (id: string) => {
      const m = byId.get(id);
      if (m && !live.current.retained.has(key(m)))
        update((v) => ({ ...v, retained: new Set([...v.retained, key(m)]) }));
    },
    showRun: (run: EarlierReplyRun) =>
      update((v) => {
        const folded = new Set(v.folded);
        for (const k of run.keys) folded.delete(k);
        return { ...v, folded, openRuns: new Map(v.openRuns).set(run.id, run) };
      }),
    hideRun: (run: EarlierReplyRun) =>
      update((v) => {
        const next = new Map(v.openRuns);
        next.delete(run.id);
        return {
          ...v,
          folded: new Set([...v.folded, ...run.keys]),
          openRuns: next,
        };
      }),
  };
}

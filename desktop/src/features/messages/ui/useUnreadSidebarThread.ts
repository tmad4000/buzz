import * as React from "react";
import {
  initialBranchChoice,
  type ThreadDisplayMode,
} from "../lib/threadDisplayPolicy";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import type { TimelineMessage } from "@/features/messages/types";
import {
  buildThreadPanelIndex,
  buildThreadPanelDataFromIndex,
  type ThreadPanelIndex,
} from "@/features/messages/lib/threadPanel";
import {
  unreadBranchPaths,
  completeThreadAncestors,
} from "@/features/messages/lib/unreadSidebar";
import {
  loadThreadExpansion,
  resolveThreadExpansion,
  saveThreadExpansion,
  threadExpansionKey,
  type ThreadExpansion,
  type ThreadExpansionChange,
  THREAD_EXPANSION_CHANGED,
} from "@/features/messages/lib/threadExpansionStorage";

type Reveal = { external: string | null; id: string | null; handled: boolean };

type State = {
  key: string | null;
  branches: ThreadExpansion;
  automatic: ThreadExpansion;
  mode?: ThreadDisplayMode;
  newIds: Set<string>;
  reveal: Reveal;
};
const empty = (key: string | null, mode?: ThreadDisplayMode): State => ({
  key,
  branches: loadThreadExpansion(key),
  automatic: new Map(),
  mode,
  newIds: new Set(),
  reveal: { external: null, id: null, handled: true },
});
export function useUnreadSidebarThread({
  enabled,
  channelId,
  currentPubkey,
  root,
  messages,
  isUnread,
  scrollTargetId,
  pending = false,
  initialMode,
  complete = true,
  autoRevealId,
  indexOverride,
}: {
  enabled: boolean;
  channelId: string | null;
  currentPubkey?: string;
  root: string | null;
  messages: TimelineMessage[];
  isUnread?: (id: string) => boolean;
  scrollTargetId: string | null;
  pending?: boolean;
  initialMode?: ThreadDisplayMode;
  complete?: boolean;
  autoRevealId?: string;
  indexOverride?: ThreadPanelIndex;
}) {
  // Community switches remount AppReady; don't migrate storage per row render.
  const community = React.useMemo(loadActiveCommunityId, []);
  const key = enabled
    ? threadExpansionKey(community, currentPubkey, channelId, root)
    : null;
  const [saved, setSaved] = React.useState<State>(() =>
    empty(key, initialMode),
  );
  const state = React.useMemo(
    () => (saved.key === key ? saved : empty(key, initialMode)),
    [saved, key, initialMode],
  );
  const index = React.useMemo(
    () => indexOverride ?? buildThreadPanelIndex(messages),
    [messages, indexOverride],
  );
  // A new locally authored row is a reveal intent, independent of unread
  // frontiers and smart budgets. Stable render keys bridge optimistic ack IDs.
  const authoredVisit = React.useRef<{
    key: string | null;
    seen: Set<string>;
    latestOwnKey?: string;
  }>({ key: null, seen: new Set() });
  const own = messages.filter(
    (m) =>
      currentPubkey &&
      m.pubkey?.toLowerCase() === currentPubkey.toLowerCase() &&
      m.id !== root,
  );
  const freshOwn = own.filter(
    (m) =>
      m.pending === true &&
      !authoredVisit.current.seen.has(m.renderKey ?? m.id),
  );
  const freshPaths = new Set<string>();
  for (const message of freshOwn) {
    const parents = completeThreadAncestors(
      index.messageById,
      root,
      message.id,
    );
    if (parents) {
      for (const id of parents) freshPaths.add(id);
      freshPaths.add(message.id);
    }
  }
  const latestOwnKey =
    freshOwn.at(-1)?.renderKey ??
    freshOwn.at(-1)?.id ??
    (authoredVisit.current.key === key
      ? authoredVisit.current.latestOwnKey
      : undefined);
  const ownSendTargetId = own.find(
    (m) => (m.renderKey ?? m.id) === latestOwnKey,
  )?.id;
  React.useLayoutEffect(() => {
    authoredVisit.current = {
      latestOwnKey,
      key,
      seen: new Set(messages.map((m) => m.renderKey ?? m.id)),
    };
  }, [key, messages, latestOwnKey]);
  const unread = new Set(
    messages.filter((m) => m.id !== root && isUnread?.(m.id)).map((m) => m.id),
  );
  const paths = unreadBranchPaths(messages, unread);
  const branchIds = [...index.directChildrenByParentId.keys()].filter((id) =>
    index.messageById.has(id),
  );
  let automatic = state.automatic;
  if (state.mode !== undefined && !pending) {
    let next: Map<string, boolean> | undefined;
    // The policy governs nested branches; direct replies remain visible.
    // A legacy/manual root collapse remains authoritative until explicit reveal.
    if (root && !state.branches.has(root) && !automatic.has(root)) {
      next = new Map(automatic);
      next.set(root, true);
    }
    let opened = [...automatic].filter(
      ([id, open]) => id !== root && open,
    ).length;
    const ordered = [...branchIds]
      .filter((id) => id !== root)
      .sort((a, b) => Number(paths.has(b)) - Number(paths.has(a)));
    for (const id of ordered) {
      if (state.branches.has(id) || automatic.has(id)) continue;
      if (state.mode === "smart" && !complete && !paths.has(id)) continue;
      next ??= new Map(automatic);
      const opens =
        initialBranchChoice(
          state.branches,
          id,
          state.mode,
          index.descendantStatsByMessageId.get(id)?.descendantCount ??
            Number.POSITIVE_INFINITY,
          paths.has(id),
        ) &&
        (state.mode === "expanded" || opened < 8);
      next.set(id, opens);
      if (opens) opened++;
    }
    automatic = next ?? automatic;
  }
  let branches =
    state.mode === undefined
      ? resolveThreadExpansion(
          state.branches,
          branchIds,
          isUnread && !pending ? new Set(paths.keys()) : null,
        )
      : state.branches;
  if (freshPaths.size) {
    const next = new Map(branches);
    for (const id of freshPaths) next.set(id, true);
    branches = next;
  }
  let reveal =
    scrollTargetId === state.reveal.external
      ? state.reveal
      : {
          external: scrollTargetId,
          id: scrollTargetId,
          handled: false,
        };
  const fulfillReveal = (preferences: ThreadExpansion, request: Reveal) => {
    if (pending || !request.id || request.handled)
      return { branches: preferences, reveal: request };
    const parents = completeThreadAncestors(
      index.messageById,
      root,
      request.id,
    );
    if (!parents) return { branches: preferences, reveal: request };
    let next: Map<string, boolean> | undefined;
    for (const parent of parents) {
      if (preferences.get(parent) === true) continue;
      next ??= new Map(preferences);
      next.set(parent, true);
    }
    return {
      branches: next ?? preferences,
      reveal: { ...request, handled: true },
    };
  };
  ({ branches, reveal } = fulfillReveal(branches, reveal));
  const newIds = new Set([...state.newIds, ...unread]);
  const stableNewIds =
    newIds.size === state.newIds.size ? state.newIds : newIds;
  const view = React.useMemo(
    () => ({
      key,
      branches,
      automatic,
      mode: state.mode,
      newIds: stableNewIds,
      reveal,
    }),
    [key, branches, automatic, state.mode, stableNewIds, reveal],
  );
  const live = React.useRef(view);
  React.useLayoutEffect(() => {
    live.current = view;
  }, [view]);
  const [preferenceError, setPreferenceError] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || !key) return;
    const changed = (event: Event) => {
      const change = (event as CustomEvent<ThreadExpansionChange>).detail;
      const current = live.current;
      if (
        !change ||
        change.key !== key ||
        current.key !== key ||
        current.branches === change.branches
      )
        return;
      const updated = {
        ...current,
        branches: change.branches,
        reveal: { ...current.reveal, handled: true },
      };
      live.current = updated;
      setSaved(updated);
      setPreferenceError(!change.persisted);
    };
    window.addEventListener(THREAD_EXPANSION_CHANGED, changed);
    return () => window.removeEventListener(THREAD_EXPANSION_CHANGED, changed);
  }, [enabled, key]);
  React.useEffect(() => {
    if (!enabled || !key || live.current !== view) return;
    if (
      saved.key === key &&
      state.branches === view.branches &&
      state.automatic === view.automatic &&
      state.newIds === view.newIds &&
      state.reveal === view.reveal
    )
      return;
    setSaved(view);
    if (state.branches !== view.branches)
      setPreferenceError(!saveThreadExpansion(key, view.branches));
  }, [enabled, key, saved.key, state, view]);
  const expanded = new Set(
    [...new Map([...automatic, ...branches])]
      .filter(([, open]) => open)
      .map(([id]) => id),
  );
  // Older own replies default open as well. Explicit choices still win;
  // only a fresh send above supersedes a pre-existing collapsed path once.
  for (const message of own) {
    const parents = completeThreadAncestors(
      index.messageById,
      root,
      message.id,
    );
    if (parents)
      for (const id of [...parents, message.id])
        if (branches.get(id) !== false) expanded.add(id);
  }
  if (autoRevealId && !pending) {
    const parents = completeThreadAncestors(
      index.messageById,
      root,
      autoRevealId,
    );
    if (parents && [...parents].every((id) => branches.get(id) !== false))
      for (const id of parents) expanded.add(id);
  }
  if (state.mode === undefined && (!isUnread || pending))
    for (const message of messages)
      if (!branches.has(message.id)) expanded.add(message.id);
  const expandedKey = [...expanded].sort().join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedKey represents Set membership, not its transient object identity.
  const entries = React.useMemo(
    () =>
      root
        ? buildThreadPanelDataFromIndex(index, root, null, expanded)
            .visibleReplies
        : [],
    [index, root, expandedKey],
  );
  const firstNewId = messages
    .filter((m) => view.newIds.has(m.id))
    .sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )[0]?.id;
  const commit = (next: ThreadExpansion, reveal: Reveal) => {
    const current = live.current;
    if (current.key !== key) return;
    const updated = { ...current, branches: next, reveal };
    live.current = updated;
    // Persist in the interaction, before navigation or an immediate app close.
    if (current.key)
      setPreferenceError(!saveThreadExpansion(current.key, next));
    setSaved(updated);
  };
  const setExpanded = (id: string, open: boolean) => {
    const next = new Map(live.current.branches);
    next.set(id, open);
    commit(next, { ...live.current.reveal, handled: true });
  };
  const toggle = (message: TimelineMessage) => {
    const next = new Map(live.current.branches);
    next.set(message.id, !(next.get(message.id) ?? expanded.has(message.id)));
    // The user's toggle also cancels any older pending automatic reveal.
    commit(next, { ...live.current.reveal, handled: true });
  };
  const revealMessage = (id: string) => {
    const current = live.current;
    const next = fulfillReveal(current.branches, {
      ...current.reveal,
      id,
      handled: false,
    });
    commit(next.branches, next.reveal);
  };
  return {
    ownSendTargetId,
    entries,
    expanded,
    newIds: new Set([...view.newIds].filter((id) => index.messageById.has(id))),
    firstNewId,
    preferenceError,
    remembered: branches,
    setExpanded,
    toggle,
    reveal: revealMessage,
    index,
  };
}

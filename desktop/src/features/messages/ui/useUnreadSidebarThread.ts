import * as React from "react";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import type { TimelineMessage } from "@/features/messages/types";
import {
  buildThreadPanelIndex,
  buildThreadPanelDataFromIndex,
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
} from "@/features/messages/lib/threadExpansionStorage";

type Reveal = { external: string | null; id: string | null; handled: boolean };

type State = {
  key: string | null;
  seed: string;
  branches: ThreadExpansion;
  newIds: Set<string>;
  reveal: Reveal;
};
const empty = (
  key: string | null,
  seed: string,
  branches = loadThreadExpansion(key),
): State => ({
  key,
  seed,
  branches,
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
}: {
  enabled: boolean;
  channelId: string | null;
  currentPubkey?: string;
  root: string | null;
  messages: TimelineMessage[];
  isUnread?: (id: string) => boolean;
  scrollTargetId: string | null;
  pending?: boolean;
}) {
  // Community switches remount AppReady; don't migrate storage per row render.
  const community = React.useMemo(loadActiveCommunityId, []);
  const key = enabled
    ? threadExpansionKey(community, currentPubkey, channelId, root)
    : null;
  // Manual branch choices follow the original event ID across organization.
  // Keep the original per-root snapshots as well, so unlink is reversible.
  const choicesKey = key
    ? `buzz-thread-manual-expansion.v1:${JSON.stringify([community, currentPubkey ?? null, channelId])}`
    : null;
  const canonicalRoots = [
    ...new Set(
      messages
        .map(
          (message) =>
            message.canonicalRootId ??
            (message.threadOrganization ? message.id : null),
        )
        .filter((id): id is string => !!id && id !== root),
    ),
  ].sort();
  const seed = JSON.stringify([key, canonicalRoots]);
  const seedBranches = (base: ThreadExpansion) => {
    const merged = new Map(base);
    const native = new Map(
      canonicalRoots.map((nativeRoot) => [
        nativeRoot,
        loadThreadExpansion(
          threadExpansionKey(community, currentPubkey, channelId, nativeRoot),
        ),
      ]),
    );
    for (const message of messages) {
      const nativeRoot =
        message.canonicalRootId ??
        (message.threadOrganization ? message.id : null);
      const choice = nativeRoot
        ? native.get(nativeRoot)?.get(message.id)
        : undefined;
      if (choice !== undefined) merged.set(message.id, choice);
    }
    for (const [id, choice] of loadThreadExpansion(choicesKey))
      merged.set(id, choice);
    return merged;
  };
  const [saved, setSaved] = React.useState<State>(() =>
    empty(key, seed, seedBranches(loadThreadExpansion(key))),
  );
  // Seed only on a committed scope/union change; re-rendering may not undo a
  // fresh explicit toggle or reset the stable unread/reveal snapshot.
  const state =
    saved.key === key && saved.seed === seed
      ? saved
      : saved.key === key
        ? { ...saved, seed, branches: seedBranches(saved.branches) }
        : empty(key, seed, seedBranches(loadThreadExpansion(key)));
  const index = React.useMemo(
    () => buildThreadPanelIndex(messages),
    [messages],
  );
  const unread = new Set(
    messages.filter((m) => m.id !== root && isUnread?.(m.id)).map((m) => m.id),
  );
  const paths = unreadBranchPaths(messages, unread);
  let branches = resolveThreadExpansion(
    state.branches,
    [...index.directChildrenByParentId.keys()].filter((id) =>
      index.messageById.has(id),
    ),
    isUnread && !pending ? new Set(paths.keys()) : null,
  );
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
    () => ({ key, seed, branches, newIds: stableNewIds, reveal }),
    [key, seed, branches, stableNewIds, reveal],
  );
  const live = React.useRef(view);
  React.useLayoutEffect(() => {
    live.current = view;
  }, [view]);
  React.useEffect(() => {
    if (!enabled || !key || live.current !== view) return;
    if (
      saved.key === key &&
      saved.seed === seed &&
      state.branches === view.branches &&
      state.newIds === view.newIds &&
      state.reveal === view.reveal
    )
      return;
    setSaved(view);
    if (state.branches !== view.branches)
      saveThreadExpansion(key, view.branches);
  }, [enabled, key, seed, saved.key, saved.seed, state, view]);
  const expanded = new Set(
    [...branches].filter(([, open]) => open).map(([id]) => id),
  );
  if (!isUnread || pending)
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
    if (current.key) saveThreadExpansion(current.key, next);
    setSaved(updated);
  };
  const toggle = (message: TimelineMessage) => {
    const next = new Map(live.current.branches);
    next.set(message.id, !(next.get(message.id) ?? expanded.has(message.id)));
    if (live.current.key !== key) return;
    if (choicesKey) {
      const manual = new Map(loadThreadExpansion(choicesKey));
      manual.set(message.id, next.get(message.id) as boolean);
      saveThreadExpansion(choicesKey, manual);
    }
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
    entries,
    expanded,
    newIds: new Set([...view.newIds].filter((id) => index.messageById.has(id))),
    firstNewId,
    toggle,
    reveal: revealMessage,
    index,
  };
}

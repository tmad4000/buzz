import * as React from "react";
import type { TimelineMessage } from "@/features/messages/types";
import {
  buildThreadPanelIndex,
  buildThreadPanelDataFromIndex,
} from "@/features/messages/lib/threadPanel";
import {
  unreadBranchPaths,
  sidebarExpansion,
  latchSidebarExpansion,
} from "@/features/messages/lib/unreadSidebar";

type State = {
  root: string | null;
  opened: Set<string>;
  collapsed: Map<string, ReadonlySet<string>>;
  newIds: Set<string>;
};
const empty = (root: string | null): State => ({
  root,
  opened: new Set(),
  collapsed: new Map(),
  newIds: new Set(),
});
export function useUnreadSidebarThread({
  enabled,
  root,
  messages,
  isUnread,
  scrollTargetId,
}: {
  enabled: boolean;
  root: string | null;
  messages: TimelineMessage[];
  isUnread?: (id: string) => boolean;
  scrollTargetId: string | null;
}) {
  const [saved, setSaved] = React.useState<State>(() => empty(null));
  const state = saved.root === root ? saved : empty(root);
  const unread = new Set(
    messages.filter((m) => m.id !== root && isUnread?.(m.id)).map((m) => m.id),
  );
  const unreadKey = [...unread].sort().join(",");
  const paths = unreadBranchPaths(messages, unread);
  const pathKey = [...paths.keys()].sort().join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: semantic ancestry/unread keys trigger the latch; path Sets are rebuilt per render.
  React.useEffect(() => {
    if (!enabled) return;
    setSaved((previous) => {
      const current = previous.root === root ? previous : empty(root);
      const next = latchSidebarExpansion(
        paths,
        current.opened,
        current.collapsed,
      );
      const newIds = new Set([...current.newIds, ...unread]);
      if (
        previous.root === root &&
        next.opened.size === current.opened.size &&
        next.collapsed.size === current.collapsed.size &&
        newIds.size === current.newIds.size
      )
        return previous;
      return { root, ...next, newIds };
    });
  }, [enabled, root, pathKey, unreadKey]);
  const expanded = sidebarExpansion(paths, state.opened, state.collapsed);
  if (!isUnread) for (const message of messages) expanded.add(message.id);
  if (scrollTargetId)
    for (const id of unreadBranchPaths(
      messages,
      new Set([scrollTargetId]),
    ).keys())
      expanded.add(id);
  const expandedKey = [...expanded].sort().join(",");
  const index = React.useMemo(
    () => buildThreadPanelIndex(messages),
    [messages],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: expandedKey represents Set membership, not its transient object identity.
  const entries = React.useMemo(
    () =>
      root
        ? buildThreadPanelDataFromIndex(index, root, null, expanded)
            .visibleReplies
        : [],
    [index, root, expandedKey],
  );
  const newIds = new Set(
    [...state.newIds, ...unread].filter((id) => index.messageById.has(id)),
  );
  const firstNewId = messages
    .filter((m) => newIds.has(m.id))
    .sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )[0]?.id;
  const toggle = (message: TimelineMessage) =>
    setSaved((previous) => {
      const current = previous.root === root ? previous : state;
      const opened = new Set(current.opened);
      const collapsed = new Map(current.collapsed);
      if (expanded.has(message.id)) {
        opened.delete(message.id);
        collapsed.set(message.id, new Set(paths.get(message.id) ?? []));
      } else {
        opened.add(message.id);
        collapsed.delete(message.id);
      }
      return { ...current, root, opened, collapsed };
    });
  const reveal = (id: string) =>
    setSaved((previous) => {
      const current = previous.root === root ? previous : state;
      const parents = unreadBranchPaths(messages, new Set([id]));
      const collapsed = new Map(current.collapsed);
      for (const parent of parents.keys()) collapsed.delete(parent);
      return {
        ...current,
        root,
        opened: new Set([...current.opened, ...parents.keys()]),
        collapsed,
      };
    });
  return { entries, expanded, newIds, firstNewId, toggle, reveal, index };
}

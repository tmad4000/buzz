import type { TimelineMessage } from "@/features/messages/types";
import { buildThreadPanelData } from "./threadPanel";

/** Walk real parents, never presentation depth (which the sidebar caps). */
export function unreadBranchPaths(
  messages: TimelineMessage[],
  unread: ReadonlySet<string>,
) {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const paths = new Map<string, Set<string>>();
  for (const id of unread) {
    let parent = byId.get(id)?.parentId;
    const visited = new Set([id]);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      const ids = paths.get(parent) ?? new Set<string>();
      ids.add(id);
      paths.set(parent, ids);
      parent = byId.get(parent)?.parentId;
    }
  }
  return paths;
}

export function sidebarExpansion(
  paths: ReadonlyMap<string, ReadonlySet<string>>,
  opened: ReadonlySet<string>,
  collapsed: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const expanded = new Set([...opened, ...paths.keys()]);
  for (const [id, seenUnread] of collapsed) {
    // A manual collapse stays put until an actually new unread descendant arrives.
    if (![...(paths.get(id) ?? [])].some((child) => !seenUnread.has(child)))
      expanded.delete(id);
  }
  return expanded;
}

export function sidebarReplies(
  messages: TimelineMessage[],
  root: string,
  expanded: ReadonlySet<string>,
) {
  return buildThreadPanelData(messages, root, null, expanded).visibleReplies;
}

export function latchSidebarExpansion(
  paths: ReadonlyMap<string, ReadonlySet<string>>,
  opened: ReadonlySet<string>,
  collapsed: ReadonlyMap<string, ReadonlySet<string>>,
) {
  const nextCollapsed = new Map(collapsed);
  for (const [id, unread] of paths) {
    const snapshot = nextCollapsed.get(id);
    if (snapshot && [...unread].some((child) => !snapshot.has(child)))
      nextCollapsed.delete(id);
  }
  return {
    opened: sidebarExpansion(paths, opened, nextCollapsed),
    collapsed: nextCollapsed,
  };
}

const visualMessages = new WeakMap<TimelineMessage, TimelineMessage>();
/** Cap paint depth without changing real parent IDs or defeating row memoization. */
export function sidebarVisualMessage(
  message: TimelineMessage,
): TimelineMessage {
  if (message.depth <= 2) return message;
  let visual = visualMessages.get(message);
  if (!visual) {
    visual = { ...message, depth: 2 };
    visualMessages.set(message, visual);
  }
  return visual;
}

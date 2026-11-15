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

/** A reveal is ready only when its entire ancestry reaches the thread root. */
export function completeThreadAncestors(
  messages: ReadonlyMap<string, TimelineMessage>,
  root: string | null,
  target: string,
): ReadonlySet<string> | null {
  if (!root) return null;
  const parents = new Set<string>();
  let current = messages.get(target);
  const visited = new Set<string>();
  while (current && current.id !== root) {
    if (visited.has(current.id) || !current.parentId) return null;
    visited.add(current.id);
    parents.add(current.parentId);
    current = messages.get(current.parentId);
  }
  return current?.id === root ? parents : null;
}

export function sidebarReplies(
  messages: TimelineMessage[],
  root: string,
  expanded: ReadonlySet<string>,
) {
  return buildThreadPanelData(messages, root, null, expanded).visibleReplies;
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

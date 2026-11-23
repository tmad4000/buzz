import type { ThreadPanelIndex, MainTimelineEntry } from "./threadPanel";
import type { TimelineMessage } from "../types";

/** Namespace one thread's local view choice by community, identity, channel and root. */
export const flatThreadViewKey = (
  community: string | null,
  identity: string | undefined,
  channel: string | null,
  root: string | null,
): string | null =>
  channel && root
    ? `buzz-thread-flat.v1:${JSON.stringify([community, identity ?? null, channel, root])}`
    : null;

const flatMessages = new WeakMap<TimelineMessage, TimelineMessage>();
function flatMessage(message: TimelineMessage): TimelineMessage {
  if (message.depth === 1) return message;
  let flat = flatMessages.get(message);
  if (!flat) {
    flat = { ...message, depth: 1 };
    flatMessages.set(message, flat);
  }
  return flat;
}

/** True when a flat list would differ from the nested tree. */
export const hasNestedReplies = (
  index: ThreadPanelIndex,
  root: string | null,
): boolean =>
  Boolean(
    root &&
      index.directChildrenByParentId
        .get(root)
        ?.some((reply) => index.directChildrenByParentId.has(reply.id)),
  );

/**
 * Every loaded reply in this thread, oldest first, with no indentation or
 * collapsed branches. A reply whose parent is not loaded still belongs when it
 * names this root. Signed parent/root references are untouched.
 */
export function buildFlatThreadEntries(
  index: ThreadPanelIndex,
  root: string | null,
): MainTimelineEntry[] {
  if (!root) return [];
  const found = new Map<string, TimelineMessage>();
  const queue = [
    root,
    ...[...index.messageById.values()]
      .filter((message) => message.id !== root && message.rootId === root)
      .map((message) => {
        found.set(message.id, message);
        return message.id;
      }),
  ];
  for (let i = 0; i < queue.length; i++)
    for (const child of index.directChildrenByParentId.get(queue[i]) ?? [])
      if (child.id !== root && !found.has(child.id)) {
        found.set(child.id, child);
        queue.push(child.id);
      }
  return [...found.values()]
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((message) => ({ message: flatMessage(message), summary: null }));
}

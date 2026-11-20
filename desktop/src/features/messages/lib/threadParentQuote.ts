import { getThreadReference } from "./threading";
import type { TimelineMessage } from "../types";

/** Nested-only native parent preview; direct-root replies already show their root.
 * The supplied index must belong to the current pane/community/identity/channel.
 * This helper never fetches or admits messages, and edits are not reply ancestry.
 */
export function threadParentQuote(
  message: TimelineMessage,
  messages: ReadonlyMap<string, TimelineMessage>,
  channelId: string,
) {
  const tags = message.tags ?? [];
  if (message.kind === 40003) return null;
  const replies = tags.filter((tag) => tag[0] === "e" && tag[3] === "reply");
  const roots = tags.filter((tag) => tag[0] === "e" && tag[3] === "root");
  if (
    replies.length !== 1 ||
    roots.length > 1 ||
    !replies[0][1] ||
    (roots.length === 1 && !roots[0][1])
  )
    return null;
  const { parentId, rootId } = getThreadReference(tags);
  if (!parentId || !rootId || parentId === rootId || parentId === message.id) {
    return null;
  }
  // Never let a reference rendered in one channel navigate into another scope.
  const channels = tags.filter((tag) => tag[0] === "h");
  if (channels.length !== 1 || channels[0]?.[1] !== channelId) {
    return null;
  }
  const candidate = messages.get(parentId);
  const parentChannels = candidate?.tags?.filter((tag) => tag[0] === "h") ?? [];
  const parent =
    candidate?.id === parentId &&
    parentChannels.length === 1 &&
    parentChannels[0][1] === channelId
      ? candidate
      : undefined;
  const firstLine = parent?.body.split(/\r?\n/, 1)[0]?.trim();
  return {
    parentId,
    rootId,
    parentLoaded: parent !== undefined,
    parentAuthor: parent?.author?.trim() || undefined,
    excerpt:
      firstLine ||
      (parent ? "Message without text" : "reply to earlier message"),
  };
}

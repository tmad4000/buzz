import { getThreadReference } from "./threading";
import type { TimelineMessage } from "../types";

/** Native reply identity, independent of presentation moves or visual depth. */
export function threadParentQuote(
  message: TimelineMessage,
  messages: ReadonlyMap<string, TimelineMessage>,
  channelId: string,
) {
  const tags = message.tags ?? [];
  const { parentId, rootId } = getThreadReference(tags);
  if (!parentId || !rootId || parentId === rootId || parentId === message.id) {
    return null;
  }
  // Never let a reference rendered in one channel navigate into another scope.
  const channels = tags.filter((tag) => tag[0] === "h");
  if (
    channels.length > 1 ||
    (channels.length === 1 && channels[0]?.[1] !== channelId)
  ) {
    return null;
  }
  const parent = messages.get(parentId);
  const firstLine = parent?.body.split(/\r?\n/, 1)[0]?.trim();
  return {
    parentId,
    rootId,
    excerpt:
      firstLine ||
      (parent ? "Message without text" : "Parent message unavailable"),
  };
}

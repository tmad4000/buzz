import type { TimelineMessage } from "../types";
import { archiveKey, type ArchiveTarget } from "./model";
/** Apply before the literal-observation unseen projection; never advance seen/read. */
export function excludeArchivedReplies(
  messages: TimelineMessage[],
  records: ReadonlyMap<string, ArchiveTarget>,
  rootId?: string,
): TimelineMessage[] {
  return messages.filter(
    (message) =>
      !records.has(archiveKey("message", message.id)) &&
      !records.has(
        archiveKey("thread", message.rootId ?? rootId ?? message.id),
      ),
  );
}

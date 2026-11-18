import type { TimelineMessage } from "../types";
import type { MainTimelineEntry } from "../lib/threadPanel";

/** Canonical order for opening context, independent of capped display depth. */
export const orderedSidebarReplies = (
  messages: TimelineMessage[],
  root: string | null,
) =>
  messages
    .filter((m) => m.id !== root && m.parentId)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));

export type EarlierReplyRun = { id: string; ids: string[]; keys: string[] };
/** Fold only complete, positively seen subtrees; required/context rows are barriers. */
export function projectEarlierReplyRuns(
  entries: MainTimelineEntry[],
  eligible: (message: TimelineMessage) => boolean,
) {
  const runs = new Map<string, EarlierReplyRun>();
  const hidden = new Set<string>();
  let i = 0;
  while (i < entries.length) {
    const first = entries[i];
    const subtreeEnd = (start: number) => {
      let end = start + 1;
      while (
        end < entries.length &&
        entries[end].message.depth > entries[start].message.depth
      )
        end++;
      return end;
    };
    const candidateEnd = (start: number) => {
      const end = subtreeEnd(start);
      return entries
        .slice(start, end)
        .every((e) => !e.summary && eligible(e.message))
        ? end
        : start;
    };
    let end = candidateEnd(i);
    if (end === i) {
      i++;
      continue;
    }
    while (
      end < entries.length &&
      entries[end].message.depth === first.message.depth &&
      entries[end].message.parentId === first.message.parentId
    ) {
      const next = candidateEnd(end);
      if (next === end) break;
      end = next;
    }
    const members = entries.slice(i, end).map((e) => e.message);
    const run = {
      id: first.message.id,
      ids: members.map((m) => m.id),
      keys: members.map((m) => m.renderKey ?? m.id),
    };
    runs.set(run.id, run);
    for (const id of run.ids.slice(1)) hidden.add(id);
    i = end;
  }
  return { entries: entries.filter((e) => !hidden.has(e.message.id)), runs };
}

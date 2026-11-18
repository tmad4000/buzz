import type { MainTimelineEntry } from "./threadPanel";

/** Stable root identity across optimistic send acknowledgement. */
export const threadActivityKey = (entry: MainTimelineEntry) =>
  entry.message.renderKey ?? entry.message.id;

/** Oldest activity first, so a new reply moves its whole root toward the bottom.
 * Summary timestamps include unloaded descendants; edits/reactions do not bump.
 * While reading, retain committed root positions and prepend newly loaded roots.
 */
export function orderThreadsByActivity(
  entries: readonly MainTimelineEntry[],
  previousIds: readonly string[] = [],
  holdPositions = false,
): MainTimelineEntry[] {
  const sorted = [...entries].sort((a, b) => {
    const activity = (entry: MainTimelineEntry) =>
      Math.max(entry.message.createdAt, entry.summary?.lastReplyAt ?? 0);
    return (
      activity(a) - activity(b) ||
      a.message.createdAt - b.message.createdAt ||
      a.message.id.localeCompare(b.message.id)
    );
  });
  if (!holdPositions || previousIds.length === 0) return sorted;
  const byId = new Map(
    entries.map((entry) => [threadActivityKey(entry), entry]),
  );
  const known = new Set(previousIds);
  return [
    ...sorted.filter((entry) => !known.has(threadActivityKey(entry))),
    ...previousIds.flatMap((id) => {
      const entry = byId.get(id);
      return entry ? [entry] : [];
    }),
  ];
}

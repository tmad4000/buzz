import * as React from "react";
import type { MainTimelineEntry } from "../lib/threadPanel";
const SIZE = 40;
const EMPTY_WINDOW: MainTimelineEntry[] = [];

export function useThreadReplyRenderWindow(
  entries: MainTimelineEntry[],
  sendScrollTargetId: string | null,
) {
  const deferred = React.useDeferredValue(entries, EMPTY_WINDOW);
  // A guarded send jump or Back restore needs its exact loaded row before
  // it can measure geometry. Keep unrelated live window updates deferred.
  if (
    sendScrollTargetId &&
    deferred !== entries &&
    entries.some((entry) => entry.message.id === sendScrollTargetId) &&
    !deferred.some((entry) => entry.message.id === sendScrollTargetId)
  ) {
    return entries;
  }
  return deferred;
}

/** Bound focused-thread DOM while keeping complete ancestry metadata elsewhere. */
export function useThreadRowWindow(
  entries: MainTimelineEntry[],
  scope: string,
  enabled: boolean,
  pending: boolean,
  unreadId: string | undefined,
  targetId: string | null,
) {
  const [saved, setSaved] = React.useState<{
    scope: string;
    start: string | null;
    target: string | null;
  }>({ scope: "", start: null, target: null });
  const indexById = React.useMemo(
    () => new Map(entries.map((entry, index) => [entry.message.id, index])),
    [entries],
  );
  const clamp = (index: number) =>
    Math.min(Math.max(0, index), Math.max(0, entries.length - SIZE));
  const initialTarget = indexById.get(targetId ?? unreadId ?? "") ?? 0;
  let start =
    saved.scope === scope
      ? (indexById.get(saved.start ?? "") ?? 0)
      : clamp(initialTarget - 8);
  const explicit = indexById.get(targetId ?? "");
  if (
    explicit !== undefined &&
    (saved.scope !== scope || saved.target !== targetId) &&
    (explicit < start || explicit >= start + SIZE)
  )
    start = clamp(explicit - 8);
  const anchor = entries[start]?.message.id ?? null;
  React.useEffect(() => {
    if (!enabled || pending || !anchor) return;
    const target =
      explicit !== undefined || targetId === null ? targetId : saved.target;
    if (
      saved.scope !== scope ||
      saved.start !== anchor ||
      saved.target !== target
    )
      setSaved({
        scope,
        start: anchor,
        target,
      });
  }, [enabled, pending, scope, anchor, saved, explicit, targetId]);
  const visible = React.useMemo(
    () => (enabled ? entries.slice(start, start + SIZE) : entries),
    [enabled, entries, start],
  );
  return {
    entries: visible,
    earlier: enabled ? start : 0,
    later: enabled ? Math.max(0, entries.length - start - SIZE) : 0,
    showEarlier: () =>
      setSaved({
        scope,
        target: targetId,
        start: entries[clamp(start - 20)]?.message.id ?? null,
      }),
    showLater: () =>
      setSaved({
        scope,
        target: targetId,
        start: entries[clamp(start + 20)]?.message.id ?? null,
      }),
  };
}

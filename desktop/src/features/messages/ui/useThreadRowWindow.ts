import * as React from "react";
import type { MainTimelineEntry } from "../lib/threadPanel";
import { loadedThreadWindowAnchor } from "./loadedThreadWindowAnchor";
const SIZE = 40;
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
      // A committed preparation may run before this passive bookkeeping.
      setSaved((current) =>
        current === saved ? { scope, start: anchor, target } : current,
      );
  }, [enabled, pending, scope, anchor, saved, explicit, targetId]);
  const visible = React.useMemo(
    () => (enabled ? entries.slice(start, start + SIZE) : entries),
    [enabled, entries, start],
  );
  const visit = React.useMemo(() => ({ scope }), [scope]);
  const committed = React.useRef<{
    visit: typeof visit;
    ensure: (ids: readonly string[]) => boolean;
  } | null>(null);
  React.useLayoutEffect(() => {
    const owner = {
      visit,
      ensure: (ids: readonly string[]) => {
        if (!enabled || pending || targetId !== null) return false;
        const found = loadedThreadWindowAnchor(indexById, entries.length, ids);
        if (!found) return false;
        if (found.index >= start && found.index < start + SIZE) return true;
        setSaved({
          scope,
          target: targetId,
          start: entries[found.start].message.id,
        });
        return true;
      },
    };
    committed.current = owner;
    return () => {
      if (committed.current === owner) committed.current = null;
    };
  }, [visit, scope, enabled, pending, targetId, indexById, entries, start]);
  return {
    // Only moves this window over already projected/loaded rows. The caller
    // must wait for the committed rows before measuring or restoring scroll.
    ensureVisible: (ids: readonly string[]) => {
      const owner = committed.current;
      return owner?.visit === visit ? owner.ensure(ids) : false;
    },
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

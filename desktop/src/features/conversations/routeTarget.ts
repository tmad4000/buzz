type RouteView = { id: string; channelId: string };
type RouteIntent =
  | { kind: "sidebar" }
  | { kind: "external"; channelId: string }
  | { kind: "history"; viewInstanceId: string | null };

/** Select presentation identity only. The caller must authorize resources and run target leave guards before navigating. */
export function selectConversationRouteTarget({
  views,
  focusedViewId,
  visibleViewIds,
  recentViewIds,
  intent,
}: {
  views: readonly RouteView[];
  focusedViewId: string;
  visibleViewIds: ReadonlySet<string>;
  /** Most recently focused first; IDs retired from the layout are ignored. */
  recentViewIds: readonly string[];
  intent: RouteIntent;
}): string | null {
  const live = new Map(views.map((view) => [view.id, view]));
  const active = live.has(focusedViewId) ? focusedViewId : null;
  // History targets its initiating instance, including a compact-hidden instance.
  // A closed instance falls back to the active view without recreating a split.
  if (intent.kind === "history")
    return intent.viewInstanceId && live.has(intent.viewInstanceId)
      ? intent.viewInstanceId
      : active;
  // An ordinary sidebar click always navigates the active view, even when a
  // sibling already shows the resource. Only external links reuse visible views.
  if (intent.kind === "sidebar") return active;
  const matches = (id: string) =>
    visibleViewIds.has(id) && live.get(id)?.channelId === intent.channelId;
  if (active && matches(active)) return active;
  for (const id of recentViewIds) if (matches(id)) return id;
  return views.find((view) => matches(view.id))?.id ?? active;
}

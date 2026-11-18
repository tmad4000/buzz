export function nextWorkspaceFocusRegion(
  regions: readonly string[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  if (regions.length === 0) return null;
  const index = current === null ? -1 : regions.indexOf(current);
  if (index < 0) return regions[direction === 1 ? 0 : regions.length - 1];
  return regions[(index + direction + regions.length) % regions.length];
}

type Pane = { viewId: string; paneId: string };
type Region = { id: string; element: HTMLElement; viewId?: string };
const controls =
  'button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

/** One committed shell lifetime; no document-global DOM lookup or editor takeover. */
export function createWorkspaceFocusCycle({
  scope,
  workspace,
  enabled,
  panes,
  focusedViewId,
  focusView,
}: {
  scope: HTMLElement;
  workspace: HTMLElement;
  enabled: () => boolean;
  panes: () => readonly Pane[];
  focusedViewId: () => string | null;
  focusView: (viewId: string) => boolean;
}) {
  let disposed = false;
  const last = new Map<string, HTMLElement>();
  const doc = scope.ownerDocument;
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    return (
      element.isConnected &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
      doc.defaultView?.getComputedStyle(element).visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.right > 0 &&
      rect.bottom > 0 &&
      rect.left < (doc.defaultView?.innerWidth ?? 0) &&
      rect.top < (doc.defaultView?.innerHeight ?? 0)
    );
  };
  const focusable = (element: HTMLElement) =>
    visible(element) && !element.matches(':disabled, [aria-disabled="true"]');
  const regions = () => {
    const list: Region[] = [];
    const sidebar =
      [...scope.querySelectorAll<HTMLElement>('[data-sidebar="sidebar"]')].find(
        visible,
      ) ??
      [...scope.querySelectorAll<HTMLElement>('[data-sidebar="trigger"]')].find(
        (element) =>
          !element.closest("[data-layout-view]") && focusable(element),
      );
    if (sidebar) list.push({ id: "sidebar", element: sidebar });
    for (const pane of panes()) {
      const host = [
        ...workspace.querySelectorAll<HTMLElement>("[data-layout-view]"),
      ].find((element) => element.dataset.layoutView === pane.viewId);
      if (host && visible(host))
        list.push({
          id: `pane:${pane.viewId}`,
          element: host,
          viewId: pane.viewId,
        });
    }
    return list;
  };
  const regionFor = (node: Node, list: Region[]) => {
    const trigger =
      node instanceof HTMLElement
        ? node.closest('[data-sidebar="trigger"]')
        : null;
    if (
      trigger &&
      scope.contains(trigger) &&
      !trigger.closest("[data-layout-view]")
    )
      return list.find((region) => region.id === "sidebar");
    return list.find((region) => region.element.contains(node));
  };
  const remember = (event: FocusEvent) => {
    if (disposed || !enabled() || !(event.target instanceof HTMLElement))
      return;
    const list = regions();
    for (const [id, element] of last)
      if (!element.isConnected || !list.some((region) => region.id === id))
        last.delete(id);
    const region = regionFor(event.target, list);
    if (region?.element.contains(event.target))
      last.set(region.id, event.target);
  };
  scope.addEventListener("focusin", remember);
  return {
    cycle(direction: 1 | -1, target: EventTarget | null): boolean {
      if (
        disposed ||
        !enabled() ||
        !workspace.isConnected ||
        doc.visibilityState !== "visible" ||
        !doc.hasFocus()
      )
        return false;
      const list = regions();
      const from =
        target instanceof Node ? regionFor(target, list)?.id : undefined;
      const id = nextWorkspaceFocusRegion(
        list.map((region) => region.id),
        from ?? (focusedViewId() ? `pane:${focusedViewId()}` : null),
        direction,
      );
      const region = list.find((candidate) => candidate.id === id);
      if (!region) return false;
      const saved = last.get(region.id);
      const fallback = region.viewId
        ? region.element.querySelector<HTMLElement>(
            '[aria-label="Conversation pane options"]',
          )
        : region.element.matches(controls)
          ? region.element
          : [...region.element.querySelectorAll<HTMLElement>(controls)].find(
              focusable,
            );
      const destination =
        saved && region.element.contains(saved) && focusable(saved)
          ? saved
          : fallback;
      if (!destination || !focusable(destination)) return false;
      if (region.viewId && !focusView(region.viewId)) return false;
      destination.focus({ preventScroll: true });
      return doc.activeElement === destination;
    },
    dispose() {
      disposed = true;
      last.clear();
      scope.removeEventListener("focusin", remember);
    },
  };
}

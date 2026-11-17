export type VirtualizedReadingAnchor = {
  row: HTMLElement;
  key: string | undefined;
  topOffset: number;
};

export function isNearVirtualizedBottom(scroller: HTMLElement): boolean {
  return (
    scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 32
  );
}

/** A partially visible first row is still the reader's anchor. */
export function captureVirtualizedReadingAnchor(
  scroller: HTMLElement,
  preferred?: HTMLElement | null,
): VirtualizedReadingAnchor | null {
  const viewport = scroller.getBoundingClientRect();
  const row =
    preferred && scroller.contains(preferred)
      ? preferred
      : [...scroller.querySelectorAll<HTMLElement>("[data-message-id]")].find(
          (candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.bottom > viewport.top && rect.top < viewport.bottom;
          },
        );
  if (!row) return null;
  return {
    row,
    key: row.dataset.messageRenderKey ?? row.dataset.messageId,
    topOffset: row.getBoundingClientRect().top - viewport.top,
  };
}

export function restoreVirtualizedReadingAnchor(
  scroller: HTMLElement,
  anchor: VirtualizedReadingAnchor,
): boolean {
  const row = scroller.contains(anchor.row)
    ? anchor.row
    : [...scroller.querySelectorAll<HTMLElement>("[data-message-id]")].find(
        (candidate) =>
          (candidate.dataset.messageRenderKey ??
            candidate.dataset.messageId) === anchor.key,
      );
  if (!row) return false;
  anchor.row = row;
  const drift =
    row.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    anchor.topOffset;
  if (Math.abs(drift) > 0.5) scroller.scrollTop += drift;
  return true;
}

export function hasVirtualizedReadingInput(scroller: HTMLElement): boolean {
  const doc = scroller.ownerDocument;
  const selection = doc.getSelection?.();
  if (
    selection &&
    !selection.isCollapsed &&
    ((selection.anchorNode && scroller.contains(selection.anchorNode)) ||
      (selection.focusNode && scroller.contains(selection.focusNode)))
  )
    return true;
  const active = doc.activeElement;
  return (
    active instanceof HTMLElement &&
    scroller.contains(active) &&
    active.closest("[data-testid='inline-thread']") !== null &&
    (active.isContentEditable ||
      active.closest("input, textarea, [contenteditable='true']") !== null)
  );
}

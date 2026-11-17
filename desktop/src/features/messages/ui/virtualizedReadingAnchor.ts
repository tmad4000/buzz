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
    (active.closest("[data-message-id]") !== null ||
      (active.closest("[data-testid='inline-thread']") !== null &&
        (active.isContentEditable ||
          active.closest("input, textarea, [contenteditable='true']") !==
            null)))
  );
}

/** Prefer the visible row being selected/acted on over an unrelated first row. */
export function preferredVirtualizedReadingRow(
  scroller: HTMLElement,
): HTMLElement | null {
  const doc = scroller.ownerDocument;
  const viewport = scroller.getBoundingClientRect();
  const visibleRow = (node: Node | null): HTMLElement | null => {
    const element = node instanceof HTMLElement ? node : node?.parentElement;
    const row = element?.closest<HTMLElement>(
      "[data-message-id], [data-outbox-id], [data-testid='message-input'], input, textarea",
    );
    if (!row || !scroller.contains(row)) return null;
    const rect = row.getBoundingClientRect();
    return rect.bottom > viewport.top && rect.top < viewport.bottom
      ? row
      : null;
  };
  const selection = doc.getSelection?.();
  if (selection && !selection.isCollapsed) {
    const selected =
      visibleRow(selection.anchorNode) ?? visibleRow(selection.focusNode);
    if (selected) return selected;
  }
  const active = doc.activeElement;
  if (!(active instanceof HTMLElement) || !scroller.contains(active))
    return null;
  const inline = active.closest<HTMLElement>("[data-testid='inline-thread']");
  if (
    !inline ||
    !(
      active.isContentEditable ||
      active.closest("input, textarea, [contenteditable='true']")
    )
  )
    return null;
  // The focused editor is a sibling of its message articles in production.
  // Its transport reply target can be a different, stationary visible row;
  // anchoring that target would still let the editor/caret drift.
  const editorRect = active.getBoundingClientRect();
  if (editorRect.bottom > viewport.top && editorRect.top < viewport.bottom)
    return active;
  const composer = active.closest<HTMLElement>(
    "[data-testid='message-composer']",
  );
  if (composer) {
    const rect = composer.getBoundingClientRect();
    if (rect.bottom > viewport.top && rect.top < viewport.bottom)
      return composer;
  }
  // Compatibility for a focused inline control inside an actual message row.
  return visibleRow(active.parentElement);
}

import { captureReadingPosition } from "../messages/ui/timelineReadingPosition.ts";

/** Read only the mounted physical viewport; persist a bounded neighbor fallback. */
export function captureViewportReadingPosition(
  element: HTMLElement,
  ids: string[],
) {
  if (
    !element.isConnected ||
    element.closest('[hidden], [inert], [aria-hidden="true"]') ||
    element.getClientRects().length === 0
  )
    return null;
  const position = captureReadingPosition(element, ids);
  return { ...position, neighbors: position.neighbors.slice(0, 8) };
}

/** Retained conversation hosts own their scrolling; ordinary routes keep router restoration. */
export function shouldRestoreRouterElement(element: Pick<Element, "closest">) {
  return element.closest("[data-conversation-view]") === null;
}

/** Fresh explicit channel navigation clears any copied sidebar origin. */
export function buildChannelNavigationState(
  previous: Record<string, unknown>,
  options?: {
    preserveSearchHighlight?: boolean;
    searchHighlight?: unknown;
    paneNavigationOrigin?: "sidebar";
  },
): Record<string, unknown> {
  const state = { ...previous };
  delete state.buzzConversationIntent;
  if (!options?.preserveSearchHighlight)
    state.searchHighlight = options?.searchHighlight ?? null;
  if (options?.paneNavigationOrigin === "sidebar")
    state.buzzConversationIntent = { version: 1, kind: "sidebar" };
  return state;
}

export function hasSidebarConversationIntent(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const intent = (state as Record<string, unknown>).buzzConversationIntent;
  return Boolean(
    intent &&
      typeof intent === "object" &&
      (intent as Record<string, unknown>).version === 1 &&
      (intent as Record<string, unknown>).kind === "sidebar",
  );
}

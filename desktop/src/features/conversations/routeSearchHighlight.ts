import {
  parseSearchHighlightNavigation,
  type SearchHighlightNavigation,
} from "../../app/navigation/searchHighlightNavigation.ts";

/** Undefined preserves this visit's local highlight; null explicitly clears it. */
export function admittedRouteSearchHighlight(
  route: {
    channelId: string;
    search: Record<string, unknown>;
    state: unknown;
  },
  channelId: string,
  projectionEcho: boolean,
): SearchHighlightNavigation | null | undefined {
  if (route.channelId !== channelId) return undefined;
  const state = route.state as { searchHighlight?: unknown } | null;
  const highlight = parseSearchHighlightNavigation(state?.searchHighlight);
  if (highlight && route.search.messageId === highlight.messageId)
    return highlight;
  return projectionEcho ? undefined : null;
}

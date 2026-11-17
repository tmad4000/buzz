import { CHANNEL_SEARCH_KEYS } from "../channels/ui/channelSearchKeys.ts";
import type { ConversationView } from "./layout/model";
import type { PanelState } from "./layout/model";

const HISTORY_KEY = "buzzConversationView";
type ViewHistoryState = {
  version: 1;
  scopeKey: string;
  viewInstanceId: string;
};

export function conversationPanelStateFromSearch(
  search: Record<string, unknown>,
): PanelState {
  const panel: PanelState = {};
  for (const key of CHANNEL_SEARCH_KEYS) {
    if (key === "autoSend") continue;
    const value = search[key];
    if (typeof value === "string" && value.length > 0) panel[key] = value;
  }
  return panel;
}

export function sameConversationPanelRoute(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return CHANNEL_SEARCH_KEYS.every((key) => {
    if (key === "autoSend") return true;
    const value = (source: Record<string, unknown>) =>
      typeof source[key] === "string" && source[key].length > 0
        ? source[key]
        : null;
    return value(a) === value(b);
  });
}

/** Private instance identity belongs only in history state, never copied URLs. */
export function conversationRouteProjection(
  view: Pick<ConversationView, "id" | "channelId" | "panelState">,
  scopeKey: string,
  replace: boolean,
  projectionId?: string,
) {
  const search: Record<string, string> = {};
  for (const key of CHANNEL_SEARCH_KEYS) {
    if (key === "autoSend") continue;
    const value = view.panelState[key];
    if (typeof value === "string" && value.length > 0) search[key] = value;
  }
  const metadata: ViewHistoryState = {
    version: 1,
    scopeKey,
    viewInstanceId: view.id,
  };
  return {
    to: "/channels/$channelId" as const,
    params: { channelId: view.channelId },
    search,
    state: (previous: Record<string, unknown>) => ({
      ...previous,
      // Local projection is not another search activation. Each view retains
      // its highlight locally instead of inheriting the previous route's one.
      searchHighlight: null,
      [HISTORY_KEY]: { ...metadata, ...(projectionId ? { projectionId } : {}) },
    }),
    replace,
    resetScroll: false,
  };
}

export function conversationProjectionId(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const metadata = (state as Record<string, unknown>)[HISTORY_KEY];
  if (!metadata || typeof metadata !== "object") return null;
  const id = (metadata as Record<string, unknown>).projectionId;
  return typeof id === "string" && id.length > 0 && id.length <= 256
    ? id
    : null;
}

/** Ignore foreign-scope or malformed history metadata; ordinary links use matching-view policy. */
export function conversationHistoryViewId(
  state: unknown,
  scopeKey: string,
): string | null {
  if (!state || typeof state !== "object") return null;
  const entry = (state as Record<string, unknown>)[HISTORY_KEY];
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Record<string, unknown>;
  return value.version === 1 &&
    value.scopeKey === scopeKey &&
    typeof value.viewInstanceId === "string" &&
    value.viewInstanceId.length > 0 &&
    value.viewInstanceId.length <= 256
    ? value.viewInstanceId
    : null;
}

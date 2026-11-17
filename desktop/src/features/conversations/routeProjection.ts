import { CHANNEL_SEARCH_KEYS } from "../channels/ui/channelSearchKeys.ts";
import type { ConversationView } from "./layout/model";

const HISTORY_KEY = "buzzConversationView";
type ViewHistoryState = {
  version: 1;
  scopeKey: string;
  viewInstanceId: string;
};

/** Private instance identity belongs only in history state, never copied URLs. */
export function conversationRouteProjection(
  view: Pick<ConversationView, "id" | "channelId" | "panelState">,
  scopeKey: string,
  replace: boolean,
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
      [HISTORY_KEY]: metadata,
    }),
    replace,
    resetScroll: false,
  };
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

import { copyExplicitExpansion } from "./explicitExpansion";
import {
  copyPanelState,
  copyViewPreferences,
  type ConversationView,
} from "./model";
import { z } from "zod";
import { conversationViewSchema, MAX_LAYOUT_BYTES } from "./schema";

export const MAX_VISITED_CHATS = 20;
const savedCache = z
  .object({
    version: z.literal(1),
    views: z
      .array(
        z
          .object({
            viewId: z.string().min(1).max(256),
            chats: z.array(conversationViewSchema).max(MAX_VISITED_CHATS),
          })
          .strict(),
      )
      .max(4),
  })
  .strict();

export function parseVisitCache(raw: string) {
  if (raw.length > MAX_LAYOUT_BYTES) return null;
  try {
    const result = savedCache.safeParse(JSON.parse(raw));
    if (!result.success) return null;
    const ids = new Set<string>();
    for (const entry of result.data.views) {
      if (ids.has(entry.viewId)) return null;
      ids.add(entry.viewId);
      const channels = new Set<string>();
      for (const chat of entry.chats) {
        if (chat.id !== entry.viewId || channels.has(chat.channelId))
          return null;
        channels.add(chat.channelId);
      }
    }
    return result.data;
  } catch {
    return null;
  }
}
export type VisitPresentation = Pick<
  ConversationView,
  | "panelState"
  | "timelineAnchor"
  | "threadAnchor"
  | "preferences"
  | "explicitExpansion"
>;

function copy(presentation: VisitPresentation): VisitPresentation {
  return {
    panelState: copyPanelState(presentation.panelState),
    ...(presentation.explicitExpansion
      ? {
          explicitExpansion: copyExplicitExpansion(
            presentation.explicitExpansion,
          ),
        }
      : {}),
    ...(presentation.preferences
      ? { preferences: copyViewPreferences(presentation.preferences) }
      : {}),
    timelineAnchor: presentation.timelineAnchor
      ? { ...presentation.timelineAnchor }
      : null,
    threadAnchor: presentation.threadAnchor
      ? { ...presentation.threadAnchor }
      : null,
  };
}

/** View-local presentation only. Never contains drafts, send commands or editors. */
export class ConversationVisitCache {
  private views = new Map<string, Map<string, VisitPresentation>>();

  restore(raw: string) {
    const parsed = parseVisitCache(raw);
    if (!parsed) return false;
    this.views.clear();
    for (const { chats } of parsed.views)
      for (const chat of chats) this.remember(chat);
    return true;
  }

  serialize() {
    return JSON.stringify({
      version: 1,
      views: [...this.views].map(([viewId, chats]) => ({
        viewId,
        chats: [...chats].map(([channelId, presentation]) => ({
          id: viewId,
          channelId,
          ...copy(presentation),
        })),
      })),
    });
  }

  remember(view: ConversationView) {
    let chats = this.views.get(view.id);
    if (!chats) {
      chats = new Map();
      this.views.set(view.id, chats);
    }
    chats.delete(view.channelId);
    chats.set(view.channelId, copy(view));
    while (chats.size > MAX_VISITED_CHATS) {
      const oldest = chats.keys().next().value;
      if (oldest === undefined) break;
      chats.delete(oldest);
    }
  }

  recall(viewId: string, channelId: string): VisitPresentation | undefined {
    const presentation = this.views.get(viewId)?.get(channelId);
    return presentation ? copy(presentation) : undefined;
  }

  retain(viewIds: ReadonlySet<string>) {
    for (const id of this.views.keys()) {
      if (!viewIds.has(id)) this.views.delete(id);
    }
  }
}

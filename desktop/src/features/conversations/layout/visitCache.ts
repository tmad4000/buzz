import { copyPanelState, type ConversationView } from "./model";

export const MAX_VISITED_CHATS = 20;
export type VisitPresentation = Pick<
  ConversationView,
  "panelState" | "timelineAnchor" | "threadAnchor"
>;

function copy(presentation: VisitPresentation): VisitPresentation {
  return {
    panelState: copyPanelState(presentation.panelState),
    timelineAnchor: presentation.timelineAnchor
      ? { ...presentation.timelineAnchor }
      : null,
    threadAnchor: presentation.threadAnchor
      ? { ...presentation.threadAnchor }
      : null,
  };
}

/** Workspace-lifetime presentation only. Never contains drafts, send commands or editors. */
export class ConversationVisitCache {
  private views = new Map<string, Map<string, VisitPresentation>>();

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

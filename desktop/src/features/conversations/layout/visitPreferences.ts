import type { ConversationViewHostProps } from "../ConversationViewHost";
import type { ConversationLayoutController } from "./controller";
import type { ConversationView } from "./model";

/** Capture the owning visit, never whichever sibling is focused at callback time. */
export function bindVisitPreferences(
  controller: ConversationLayoutController,
  view: ConversationView,
): Pick<
  ConversationViewHostProps,
  | "initialTimelineMode"
  | "onTimelineModeChange"
  | "presentationVisitKey"
  | "initialThreadViewMode"
  | "initialThreadPanelWidthPx"
  | "onThreadViewModeChange"
  | "onThreadPanelWidthChange"
> {
  const visit = controller.visitToken(view.id);
  return {
    presentationVisitKey: JSON.stringify([view.id, view.channelId, visit]),
    initialTimelineMode: view.preferences?.timelineMode,
    onTimelineModeChange: (timelineMode) => {
      controller.update(view.id, view.channelId, visit, {
        preferences: { timelineMode },
      });
    },
    initialThreadViewMode: view.preferences?.threadMode,
    initialThreadPanelWidthPx: view.preferences?.preferredThreadWidth,
    onThreadViewModeChange: (threadMode) => {
      controller.update(view.id, view.channelId, visit, {
        preferences: { threadMode },
      });
    },
    onThreadPanelWidthChange: (preferredThreadWidth) => {
      controller.update(view.id, view.channelId, visit, {
        preferences: { preferredThreadWidth },
      });
    },
  };
}

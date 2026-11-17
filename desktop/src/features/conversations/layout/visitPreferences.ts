import type { ConversationViewHostProps } from "../ConversationViewHost";
import type { ConversationLayoutController } from "./controller";
import type { ConversationView } from "./model";

/** Capture the owning visit, never whichever sibling is focused at callback time. */
export function bindVisitPreferences(
  controller: ConversationLayoutController,
  view: ConversationView,
): Pick<
  ConversationViewHostProps,
  | "initialExplicitExpansion"
  | "seedLegacyExpansions"
  | "onExplicitExpansionChange"
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
    initialExplicitExpansion: view.explicitExpansion,
    seedLegacyExpansions: view.legacyExpansionOwner === true,
    onExplicitExpansionChange: (explicitExpansion) =>
      controller.update(view.id, view.channelId, visit, { explicitExpansion }),
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

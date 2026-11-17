import * as React from "react";
import {
  useDrafts,
  useDraftsSnapshot,
} from "@/features/messages/lib/useDrafts";
import { DraftEditorBoundary } from "./ConversationDraftEditors";
import type { DraftEditorCoordinator } from "./draftEditorCoordinator";

/** Keep the non-owner preview synchronized with canonical draft persistence. */
export function ConversationComposerOwnership({
  children,
  coordinator,
  draftKey,
  viewInstanceId,
  onAttachmentAcceptanceChange,
}: {
  children: React.ReactNode;
  coordinator: DraftEditorCoordinator;
  draftKey: string;
  viewInstanceId: string;
  onAttachmentAcceptanceChange?: (accepts: boolean) => void;
}) {
  const drafts = useDrafts();
  useDraftsSnapshot();
  const savedPreview = drafts.loadDraft(draftKey)?.content ?? "";
  const handleEditingChange = React.useCallback(
    (editing: boolean) => {
      if (!editing) onAttachmentAcceptanceChange?.(false);
    },
    [onAttachmentAcceptanceChange],
  );
  return (
    <DraftEditorBoundary
      coordinator={coordinator}
      draftKey={draftKey}
      viewInstanceId={viewInstanceId}
      savedPreview={savedPreview}
      onEditingChange={handleEditingChange}
    >
      {children}
    </DraftEditorBoundary>
  );
}

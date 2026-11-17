import * as React from "react";
import { DraftEditorCoordinator } from "./draftEditorCoordinator";

export const ConversationDraftEditorsContext =
  React.createContext<DraftEditorCoordinator | null>(null);
export const DraftEditorPresentationContext = React.createContext<{
  canEdit: () => boolean;
  publishPreview: (text: string) => void;
  setLocked: (locked: boolean) => void;
} | null>(null);

/** Mount once under a key containing canonical identity/community/window scope. */
export function ConversationDraftEditorsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [coordinator] = React.useState(() => new DraftEditorCoordinator());
  return (
    <ConversationDraftEditorsContext.Provider value={coordinator}>
      {children}
    </ConversationDraftEditorsContext.Provider>
  );
}

/** Only the owner mounts its live composer; other instances cannot mutate/send the draft. */
export function DraftEditorBoundary({
  coordinator,
  draftKey,
  viewInstanceId,
  children,
  savedPreview = "",
  onEditingChange,
}: {
  coordinator: DraftEditorCoordinator;
  draftKey: string;
  viewInstanceId: string;
  children: React.ReactNode;
  savedPreview?: string;
  onEditingChange?: (editing: boolean) => void;
}) {
  const localId = React.useId();
  const editorId = `${viewInstanceId}:${localId}`;
  const locked = React.useRef(false);
  React.useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  );
  React.useLayoutEffect(
    () => coordinator.register(draftKey, editorId, () => !locked.current),
    [coordinator, draftKey, editorId],
  );
  const editing = coordinator.owner(draftKey) === editorId;
  React.useLayoutEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  const presentation = React.useMemo(
    () => ({
      canEdit: () => coordinator.owner(draftKey) === editorId,
      publishPreview: (text: string) =>
        coordinator.publishPreview(draftKey, editorId, text),
      setLocked: (next: boolean) => {
        if (locked.current === next) return;
        locked.current = next;
        coordinator.invalidateLocks();
      },
    }),
    [coordinator, draftKey, editorId],
  );
  if (editing)
    return (
      <DraftEditorPresentationContext.Provider value={presentation}>
        {children}
      </DraftEditorPresentationContext.Provider>
    );
  const canTakeOver = coordinator.canTakeOver(draftKey);
  return (
    <div
      className="relative z-10 space-y-2 rounded-md border border-border bg-background p-3"
      data-draft-preview
    >
      <p className="text-sm text-muted-foreground">Editing in other pane</p>
      <p className="whitespace-pre-wrap break-words text-message">
        {coordinator.preview(draftKey) ?? savedPreview}
      </p>
      <button
        type="button"
        className="rounded-md border border-border px-3 py-1 text-sm focus-visible:outline focus-visible:outline-2"
        disabled={!canTakeOver}
        onClick={() => coordinator.takeOver(draftKey, editorId)}
      >
        Take over
      </button>
      {!canTakeOver && (
        <p className="text-xs text-muted-foreground">
          Finish the current send, upload, or edit before taking over.
        </p>
      )}
    </div>
  );
}

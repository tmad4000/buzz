import * as React from "react";
import { useDndContext, useDndMonitor, useDroppable } from "@dnd-kit/core";
import { ConversationDragContext } from "./ConversationDragCoordinator";
import { canSplit, resolveDropEdge, type SplitEdge } from "./layout/geometry";

export type DraggedConversation = { channelId: string; label: string };
export type OpenDraggedConversation = (drop: {
  channelId: string;
  paneId: string;
  edge: SplitEdge;
  replace: boolean;
}) => void;
export type ConversationDragTarget = {
  resolveConversation: (channelId: string) => DraggedConversation | null;
  onOpen: OpenDraggedConversation;
};
type Props = ConversationDragTarget & { paneId: string; replace: boolean };
type Preview = DraggedConversation & { edge: SplitEdge; allowed: boolean };

/** An authorized resolver is mandatory; dragging never creates a DM or joins a channel. */
export function ConversationPaneDropTarget(props: Props) {
  const shared = React.useContext(ConversationDragContext);
  return shared ? <BoundDropTarget {...props} shared={shared} /> : null;
}
function BoundDropTarget({
  paneId,
  replace,
  resolveConversation,
  onOpen,
  shared,
}: Props & {
  shared: NonNullable<React.ContextType<typeof ConversationDragContext>>;
}) {
  const { active } = useDndContext();
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const node = React.useRef<HTMLDivElement | null>(null);
  const current = React.useRef({
    paneId,
    replace,
    resolveConversation,
    onOpen,
  });
  current.current = { paneId, replace, resolveConversation, onOpen };
  const resolve = (data: Record<string, unknown> | undefined) => {
    if (data?.type !== "channel" || typeof data.channelId !== "string")
      return null;
    const conversation = current.current.resolveConversation(data.channelId);
    return conversation?.channelId === data.channelId ? conversation : null;
  };
  const compatible = shared.canCommit() ? resolve(active?.data.current) : null;
  const id = `conversation-pane-drop:${paneId}`;
  const { setNodeRef } = useDroppable({
    id,
    data: { type: "conversation-pane", paneId },
    disabled: !compatible,
  });
  const ref = React.useCallback(
    (element: HTMLDivElement | null) => {
      node.current = element;
      setNodeRef(element);
    },
    [setNodeRef],
  );
  const candidate = (
    data: Record<string, unknown> | undefined,
  ): Preview | null => {
    if (!shared.canCommit()) return null;
    const conversation = resolve(data);
    const point = shared.pointer.current;
    const target = node.current;
    if (!conversation || !point || !target?.isConnected) return null;
    const rect = target.getBoundingClientRect();
    const edge = resolveDropEdge(rect, point);
    // Portaled dialogs and popovers must not expose a drop target behind them.
    const hit = document.elementFromPoint(point.x, point.y);
    if (!edge || !hit || !target.parentElement?.contains(hit)) return null;
    return {
      ...conversation,
      edge,
      allowed:
        current.current.replace ||
        canSplit(
          rect,
          edge === "right" ? "horizontal" : "vertical",
          window.innerWidth,
        ),
    };
  };
  const refresh = (data: Record<string, unknown> | undefined) => {
    const next = candidate(data);
    setPreview((current) =>
      current?.channelId === next?.channelId &&
      current?.edge === next?.edge &&
      current?.allowed === next?.allowed &&
      current?.label === next?.label
        ? current
        : next,
    );
  };
  useDndMonitor({
    onDragStart: () => setPreview(null),
    onDragMove: (event) => refresh(event.active.data.current),
    onDragOver: (event) => refresh(event.active.data.current),
    onDragCancel: () => setPreview(null),
    onDragEnd: (event) => {
      const next = candidate(event.active.data.current);
      setPreview(null);
      const target = current.current;
      if (
        event.over?.id !== `conversation-pane-drop:${target.paneId}` ||
        !next?.allowed
      )
        return;
      target.onOpen({
        channelId: next.channelId,
        paneId: target.paneId,
        edge: next.edge,
        replace: target.replace,
      });
    },
  });
  const visiblePreview =
    compatible && preview?.channelId === compatible.channelId
      ? { ...preview, label: compatible.label }
      : null;
  const label = visiblePreview
    ? !visiblePreview.allowed
      ? "More space needed"
      : replace
        ? `Open in this pane · ${visiblePreview.label}`
        : `Open ${visiblePreview.label} here`
    : null;
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-0 z-50"
      data-conversation-drop-target={paneId}
    >
      {compatible && (
        <>
          <div
            className="absolute inset-y-0 right-0 w-8 border-l border-primary/20 bg-primary/5"
            data-testid="conversation-right-edge"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-8 border-t border-primary/20 bg-primary/5"
            data-testid="conversation-bottom-edge"
          />
        </>
      )}
      {visiblePreview && (
        <div
          data-testid="conversation-drop-preview"
          role="status"
          aria-live="polite"
          className="absolute flex items-center justify-center border-2 border-primary/50 bg-primary/10 p-4"
          style={
            replace
              ? { inset: 0 }
              : visiblePreview.edge === "right"
                ? { insetBlock: 0, right: 0, width: "50%" }
                : { insetInline: 0, bottom: 0, height: "50%" }
          }
        >
          <span className="max-w-full rounded-md border bg-background/95 px-3 py-2 text-center text-sm font-medium text-foreground shadow-sm">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

import * as React from "react";
import {
  DndContext,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type Announcements,
} from "@dnd-kit/core";
import { acquireEscapeSurface } from "@/shared/hooks/escapeSurfaces";

const announcements: Announcements = {
  onDragStart: ({ active }) =>
    active.data.current?.type === "section"
      ? "Moving sidebar section."
      : "Dragging conversation.",
  onDragOver: ({ over }) =>
    !over
      ? "No drop target."
      : over.data.current?.type === "conversation-pane"
        ? "Conversation area. Move to a right or bottom edge."
        : "Sidebar grouping target.",
  onDragEnd: () => "Drag finished.",
  onDragCancel: () => "Drag canceled.",
};

type Point = { x: number; y: number };
type SharedDrag = {
  active: React.RefObject<boolean>;
  pointer: React.RefObject<Point | null>;
  scopeKey: string;
  canCommit: () => boolean;
};
export const ConversationDragContext = React.createContext<SharedDrag | null>(
  null,
);

/** One pointer gesture spans sidebar grouping and the conversation canvas. */
export function ConversationDragCoordinator({
  children,
  scopeKey = "standalone",
}: {
  children: React.ReactNode;
  scopeKey?: string;
}) {
  const active = React.useRef(false);
  const pointer = React.useRef<Point | null>(null);
  const releaseEscape = React.useRef<(() => void) | null>(null);
  const currentScope = React.useRef(scopeKey);
  const mounted = React.useRef(true);
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  currentScope.current = scopeKey;
  const startedScope = React.useRef<string | null>(null);
  const canCommit = React.useCallback(
    () => mounted.current && startedScope.current === currentScope.current,
    [],
  );
  const scope = React.useMemo(
    () => ({ active, pointer, scopeKey, canCommit }),
    [scopeKey, canCommit],
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const collisionDetection = React.useCallback<CollisionDetection>((args) => {
    pointer.current = args.pointerCoordinates;
    return pointerWithin(args);
  }, []);
  const finish = React.useCallback(() => {
    active.current = false;
    releaseEscape.current?.();
    releaseEscape.current = null;
    // Keep the final point until drop monitors have consumed the event.
  }, []);
  React.useEffect(() => {
    const prioritizeDragEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && active.current) {
        // Let dnd-kit's document sensor cancel; bubble listeners must then yield.
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", prioritizeDragEscape, { capture: true });
    return () => {
      window.removeEventListener("keydown", prioritizeDragEscape, {
        capture: true,
      });
      finish();
    };
  }, [finish]);
  return (
    <ConversationDragContext.Provider value={scope}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "Use pane and section menus for keyboard actions. With a pointer, drag to an edge or sidebar group. Press Escape to cancel.",
          },
        }}
        cancelDrop={() => !canCommit()}
        onDragStart={() => {
          finish();
          pointer.current = null;
          active.current = true;
          startedScope.current = currentScope.current;
          releaseEscape.current = acquireEscapeSurface();
        }}
        onDragEnd={finish}
        onDragCancel={finish}
      >
        {children}
      </DndContext>
    </ConversationDragContext.Provider>
  );
}

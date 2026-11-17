import * as React from "react";
import { DIVIDER_PX } from "./layout/geometry";
import { resizeAtBoundary, type DividerRegion } from "./layout/regions";

export type ResizeConversationGroup = (
  groupId: string,
  sizes: number[],
  commit: boolean,
) => void;
type Drag = {
  pointerId: number;
  start: number;
  divider: DividerRegion;
  latest: number[];
  cursor: string;
  selection: string;
};

/** Only explicit resizing emits changes; viewport projection never persists a clamped ratio. */
export function ConversationDivider({
  divider,
  onResize,
}: {
  divider: DividerRegion;
  onResize: ResizeConversationGroup;
}) {
  const drag = React.useRef<Drag | null>(null);
  const restoreStyles = React.useCallback(() => {
    const current = drag.current;
    if (!current) return;
    document.body.style.cursor = current.cursor;
    document.body.style.userSelect = current.selection;
    drag.current = null;
  }, []);
  React.useEffect(() => restoreStyles, [restoreStyles]);
  const horizontal = divider.axis === "horizontal";
  const resize = (ratio: number, commit = true) =>
    onResize(divider.groupId, resizeAtBoundary(divider, ratio), commit);
  return (
    // biome-ignore lint/a11y/useSemanticElements: A focusable interactive window splitter uses the ARIA separator pattern, not a static rule.
    <button
      type="button"
      role="separator"
      aria-label="Resize conversations"
      aria-orientation={horizontal ? "vertical" : "horizontal"}
      aria-valuemin={Math.round(divider.minimumRatio * 100)}
      aria-valuemax={Math.round(divider.maximumRatio * 100)}
      aria-valuenow={Math.round(divider.ratio * 100)}
      aria-valuetext={`${Math.round(divider.ratio * 100)} percent`}
      className="absolute z-20 flex items-center justify-center bg-border/40 outline-none hover:bg-primary/20 focus-visible:bg-primary/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      style={{
        ...divider.rect,
        cursor: horizontal ? "col-resize" : "row-resize",
        touchAction: "none",
      }}
      onDoubleClick={() => resize(0.5)}
      onKeyDown={(event) => {
        const negative = horizontal ? "ArrowLeft" : "ArrowUp";
        const positive = horizontal ? "ArrowRight" : "ArrowDown";
        const ratio =
          event.key === negative
            ? divider.ratio - 0.05
            : event.key === positive
              ? divider.ratio + 0.05
              : event.key === "Home"
                ? divider.minimumRatio
                : event.key === "End"
                  ? divider.maximumRatio
                  : null;
        if (ratio === null) return;
        event.preventDefault();
        event.stopPropagation();
        resize(ratio);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        restoreStyles();
        drag.current = {
          pointerId: event.pointerId,
          start: horizontal ? event.clientX : event.clientY,
          divider,
          latest: divider.savedSizes,
          cursor: document.body.style.cursor,
          selection: document.body.style.userSelect,
        };
        document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const d = current.divider;
        const extent =
          (d.axis === "horizontal" ? d.groupRect.width : d.groupRect.height) -
          DIVIDER_PX * (d.sizes.length - 1);
        const delta =
          (d.axis === "horizontal" ? event.clientX : event.clientY) -
          current.start;
        current.latest = resizeAtBoundary(d, d.ratio + delta / extent);
        onResize(d.groupId, current.latest, false);
      }}
      onPointerUp={(event) => {
        const current = drag.current;
        if (!current || current.pointerId !== event.pointerId) return;
        onResize(current.divider.groupId, current.latest, true);
        restoreStyles();
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        const current = drag.current;
        if (current)
          onResize(current.divider.groupId, current.divider.savedSizes, true);
        restoreStyles();
      }}
      onLostPointerCapture={() => {
        const current = drag.current;
        if (current)
          onResize(current.divider.groupId, current.divider.savedSizes, true);
        restoreStyles();
      }}
    >
      <span
        aria-hidden
        className={
          horizontal
            ? "h-8 w-px bg-muted-foreground/40"
            : "h-px w-8 bg-muted-foreground/40"
        }
      />
    </button>
  );
}

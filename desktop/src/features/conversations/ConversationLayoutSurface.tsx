import * as React from "react";
import { Button } from "@/shared/ui/button";
import {
  ConversationPaneDropTarget,
  type ConversationDragTarget,
} from "./ConversationPaneDropTarget";
import {
  ConversationDivider,
  type ResizeConversationGroup,
} from "./ConversationDivider";
import {
  ConversationPaneMenu,
  type ConversationPaneCommand,
} from "./ConversationPaneMenu";
import { canDisplayLayout, canSplit } from "./layout/geometry";
import {
  listPanes,
  type ConversationLayout,
  type ConversationView,
  type PaneNode,
} from "./layout/model";
import { projectLayoutRegions } from "./layout/regions";

export type RenderConversationPane = (options: {
  view: ConversationView;
  pane: PaneNode;
  focused: boolean;
  visible: boolean;
  headerEndActions: React.ReactNode;
}) => React.ReactNode;
type SurfaceProps = {
  layout: ConversationLayout;
  labelForView: (view: ConversationView) => string;
  renderPane: RenderConversationPane;
  onFocusPane: (paneId: string) => void;
  onCommand: (paneId: string, command: ConversationPaneCommand) => void;
  onResize: ResizeConversationGroup;
  canRestore?: boolean;
  focusRequest?: { viewId: string; sequence: number };
  dragTarget?: ConversationDragTarget;
};

/** Layout topology determines rectangles; stable view keys own mounted conversation state. */
export function ConversationLayoutSurface({
  layout,
  labelForView,
  renderPane,
  onFocusPane,
  onCommand,
  onResize,
  canRestore = false,
  focusRequest,
  dragTarget,
}: SurfaceProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = React.useState({
    width: 0,
    height: 0,
    viewport: 0,
  });
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const rect = root.getBoundingClientRect();
      const next = {
        width: rect.width,
        height: rect.height,
        viewport: window.innerWidth,
      };
      setBounds((current) =>
        current.width === next.width &&
        current.height === next.height &&
        current.viewport === next.viewport
          ? current
          : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(root);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  const panes = listPanes(layout.root);
  const split = panes.length > 1;
  const displayable = canDisplayLayout(layout.root, bounds, bounds.viewport);
  const regions = displayable
    ? projectLayoutRegions(layout.root, {
        left: 0,
        top: 0,
        width: bounds.width,
        height: bounds.height,
      })
    : null;
  const compact = split && (!displayable || regions === null);
  const focusHeader = React.useCallback((viewId: string) => {
    const host = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>("[data-layout-view]") ??
        [],
    ).find((element) => element.dataset.layoutView === viewId);
    if (
      !host ||
      host.hidden ||
      host.closest('[hidden], [inert], [aria-hidden="true"]') !== null ||
      host.dataset.layoutFocused !== "true" ||
      document.visibilityState !== "visible" ||
      !document.hasFocus()
    )
      return;
    host
      .querySelector<HTMLElement>('[aria-label="Conversation pane options"]')
      ?.focus({ preventScroll: true });
  }, []);
  const requestedView = focusRequest?.viewId;
  const requestSequence = focusRequest?.sequence;
  React.useEffect(() => {
    if (!requestedView || requestSequence === undefined) return;
    const frame = requestAnimationFrame(() => focusHeader(requestedView));
    return () => cancelAnimationFrame(frame);
  }, [focusHeader, requestedView, requestSequence]);
  const focus = (pane: PaneNode) => {
    onFocusPane(pane.id);
    requestAnimationFrame(() => focusHeader(pane.viewInstanceId));
  };
  return (
    <div
      ref={rootRef}
      className="relative h-full min-h-0 w-full min-w-0 overflow-hidden"
      data-conversation-layout
      data-compact-layout={compact || undefined}
      onKeyDownCapture={(event) => {
        if (
          event.key !== "F6" ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.nativeEvent.isComposing ||
          !rootRef.current?.contains(event.target as Node) ||
          panes.length < 2
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        const current = panes.findIndex(
          (pane) => pane.id === layout.focusedPaneId,
        );
        focus(
          panes[
            (current + (event.shiftKey ? -1 : 1) + panes.length) % panes.length
          ],
        );
      }}
    >
      {compact && (
        <div
          role="toolbar"
          aria-label="Open conversations"
          className="absolute inset-x-0 top-0 z-30 flex h-9 items-center gap-1 border-b bg-background px-2"
        >
          {panes.map((pane) => (
            <Button
              key={pane.viewInstanceId}
              type="button"
              size="sm"
              variant={pane.id === layout.focusedPaneId ? "secondary" : "ghost"}
              aria-pressed={pane.id === layout.focusedPaneId}
              className="min-w-0 truncate"
              onClick={() => focus(pane)}
            >
              {labelForView(layout.views[pane.viewInstanceId])}
            </Button>
          ))}
        </div>
      )}
      {panes.map((pane) => {
        const view = layout.views[pane.viewInstanceId];
        const focused = pane.id === layout.focusedPaneId;
        const visible = !compact || focused;
        const rect = regions?.panes.find(
          (region) => region.pane.id === pane.id,
        )?.rect;
        const top = compact ? 36 : 0;
        return (
          <div
            key={view.id}
            data-layout-view={view.id}
            data-layout-focused={focused || undefined}
            hidden={!visible}
            className="absolute flex min-h-0 min-w-0 flex-col overflow-hidden"
            style={{
              ...(rect ?? {
                left: 0,
                top,
                width: bounds.width || "100%",
                height: bounds.height
                  ? Math.max(0, bounds.height - top)
                  : "100%",
              }),
              display: visible ? undefined : "none",
            }}
          >
            <div
              aria-hidden
              className={
                focused && split
                  ? "pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 bg-primary/70"
                  : "hidden"
              }
            />
            {renderPane({
              view,
              pane,
              focused,
              visible,
              headerEndActions: (
                <ConversationPaneMenu
                  split={split}
                  rightFeasible={canSplit(
                    bounds,
                    "horizontal",
                    bounds.viewport,
                  )}
                  bottomFeasible={canSplit(bounds, "vertical", bounds.viewport)}
                  canRestore={canRestore}
                  onCommand={(command) => onCommand(pane.id, command)}
                />
              ),
            })}
            {dragTarget && (
              <ConversationPaneDropTarget
                {...dragTarget}
                paneId={pane.id}
                replace={split}
              />
            )}
          </div>
        );
      })}
      {!compact &&
        regions?.dividers.map((divider) => (
          <ConversationDivider
            key={`${divider.groupId}:${divider.index}`}
            divider={divider}
            onResize={onResize}
          />
        ))}
    </div>
  );
}

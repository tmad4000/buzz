// Adapted from Paseo's split-drop-zone geometry, Apache-2.0.
// Copyright (c) 2025-present Mohamed Boudra. See docs/conversation-layout-provenance.md.
import type { LayoutNode, SplitAxis } from "./model";
export const DIVIDER_PX = 8;
export const MIN_LEAF_WIDTH_PX = 360;
export const MIN_LEAF_HEIGHT_PX = 280;
export const EDGE_TARGET_PX = 32;
export type Size = { width: number; height: number };
export type Rect = Size & { left: number; top: number };
export type SplitEdge = "right" | "bottom";

/** Recursive minima let the same renderer support later arbitrary topology. */
export function minimumSize(
  node: LayoutNode,
  leaf: Size = { width: MIN_LEAF_WIDTH_PX, height: MIN_LEAF_HEIGHT_PX },
): Size {
  if (node.kind === "pane") return leaf;
  const sizes = node.children.map((child) => minimumSize(child, leaf));
  return node.axis === "horizontal"
    ? {
        width:
          sizes.reduce((sum, size) => sum + size.width, 0) +
          DIVIDER_PX * (sizes.length - 1),
        height: Math.max(...sizes.map((size) => size.height)),
      }
    : {
        width: Math.max(...sizes.map((size) => size.width)),
        height:
          sizes.reduce((sum, size) => sum + size.height, 0) +
          DIVIDER_PX * (sizes.length - 1),
      };
}

/** Mobile always projects one view; insufficient desktop space never destroys the saved tree. */
export function canDisplayLayout(
  root: LayoutNode,
  available: Size,
  viewportWidth: number,
  leaf?: Size,
): boolean {
  if (
    !Number.isFinite(viewportWidth) ||
    viewportWidth < 768 ||
    !Number.isFinite(available.width) ||
    !Number.isFinite(available.height)
  )
    return false;
  const min = minimumSize(root, leaf);
  return available.width >= min.width && available.height >= min.height;
}

/** Only compatible right/bottom edges participate; corners compare normalized distances with right-first ties. */
export function resolveDropEdge(
  rect: Rect,
  point: { x: number; y: number },
  targetPx = EDGE_TARGET_PX,
): SplitEdge | null {
  if (
    ![
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      point.x,
      point.y,
      targetPx,
    ].every(Number.isFinite) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    targetPx <= 0
  )
    return null;
  const x = point.x - rect.left;
  const y = point.y - rect.top;
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
  const right = rect.width - x;
  const bottom = rect.height - y;
  const atRight = right <= targetPx;
  const atBottom = bottom <= targetPx;
  if (atRight && atBottom)
    return right / rect.width <= bottom / rect.height ? "right" : "bottom";
  return atRight ? "right" : atBottom ? "bottom" : null;
}

/** Two-leaf feasibility; dimensions are content-area CSS pixels, not total window size. */
export function canSplit(
  available: Size,
  axis: SplitAxis,
  viewportWidth: number,
  leaf: Size = { width: MIN_LEAF_WIDTH_PX, height: MIN_LEAF_HEIGHT_PX },
): boolean {
  const node: LayoutNode = {
    kind: "group",
    id: "group-preview",
    axis,
    sizes: [0.5, 0.5],
    children: [
      { kind: "pane", id: "pane-preview-a", viewInstanceId: "view-preview-a" },
      { kind: "pane", id: "pane-preview-b", viewInstanceId: "view-preview-b" },
    ],
  };
  return canDisplayLayout(node, available, viewportWidth, leaf);
}

/** Clamp only the displayed divider ratio; viewport changes need not rewrite the saved desktop ratio. */
export function clampDividerRatio(
  ratio: number,
  extent: number,
  firstMinimum: number,
  secondMinimum: number,
): number | null {
  const usable = extent - DIVIDER_PX;
  if (
    ![extent, firstMinimum, secondMinimum].every(Number.isFinite) ||
    firstMinimum <= 0 ||
    secondMinimum <= 0 ||
    usable < firstMinimum + secondMinimum
  )
    return null;
  return Math.min(
    1 - secondMinimum / usable,
    Math.max(firstMinimum / usable, Number.isFinite(ratio) ? ratio : 0.5),
  );
}

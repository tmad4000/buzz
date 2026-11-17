import { DIVIDER_PX, minimumSize, type Rect } from "./geometry";
import {
  normalizeSizes,
  type LayoutNode,
  type PaneNode,
  type SplitAxis,
} from "./model";

export type PaneRegion = { pane: PaneNode; rect: Rect };
export type DividerRegion = {
  groupId: string;
  index: number;
  axis: SplitAxis;
  rect: Rect;
  groupRect: Rect;
  sizes: number[];
  savedSizes: number[];
  minimumSizes: number[];
  ratio: number;
  minimumRatio: number;
  maximumRatio: number;
};
export type LayoutRegions = { panes: PaneRegion[]; dividers: DividerRegion[] };

/** Preserve requested ratios where feasible; freeze constrained children at their minima. */
export function allocateExtents(
  extent: number,
  weights: number[],
  minima: number[],
): number[] | null {
  if (
    !Number.isFinite(extent) ||
    weights.length !== minima.length ||
    minima.length === 0 ||
    minima.some((min) => !Number.isFinite(min) || min <= 0)
  )
    return null;
  if (minima.reduce((sum, min) => sum + min, 0) > extent) return null;
  const normalized = normalizeSizes(weights, weights.length);
  const result = Array(weights.length).fill(0);
  const pending = new Set(weights.map((_, index) => index));
  let remaining = extent;
  while (pending.size) {
    const weight = [...pending].reduce(
      (sum, index) => sum + normalized[index],
      0,
    );
    const constrained = [...pending].filter(
      (index) => (remaining * normalized[index]) / weight < minima[index],
    );
    if (constrained.length === 0) {
      for (const index of pending)
        result[index] = (remaining * normalized[index]) / weight;
      break;
    }
    for (const index of constrained) {
      result[index] = minima[index];
      remaining -= minima[index];
      pending.delete(index);
    }
  }
  return result;
}

/** Flat keyed view rendering avoids remounts when a tree action swaps presentation instances. */
export function projectLayoutRegions(
  root: LayoutNode,
  bounds: Rect,
): LayoutRegions | null {
  if (
    ![bounds.left, bounds.top, bounds.width, bounds.height].every(
      Number.isFinite,
    )
  )
    return null;
  const minimum = minimumSize(root);
  if (bounds.width < minimum.width || bounds.height < minimum.height)
    return null;
  const result: LayoutRegions = { panes: [], dividers: [] };
  function visit(node: LayoutNode, rect: Rect): boolean {
    if (node.kind === "pane") {
      result.panes.push({ pane: node, rect });
      return true;
    }
    const horizontal = node.axis === "horizontal";
    const extent =
      (horizontal ? rect.width : rect.height) -
      DIVIDER_PX * (node.children.length - 1);
    const minima = node.children.map((child) => {
      const min = minimumSize(child);
      return horizontal ? min.width : min.height;
    });
    const allocated = allocateExtents(extent, node.sizes, minima);
    if (!allocated) return false;
    let offset = 0;
    for (let index = 0; index < node.children.length; index++) {
      const childRect = horizontal
        ? { ...rect, left: rect.left + offset, width: allocated[index] }
        : { ...rect, top: rect.top + offset, height: allocated[index] };
      if (!visit(node.children[index], childRect)) return false;
      offset += allocated[index];
      if (index < node.children.length - 1) {
        // Adjacent boundary bounds reserve every child's minimum on each side.
        const firstMinimum = minima
          .slice(0, index + 1)
          .reduce((a, b) => a + b, 0);
        const secondMinimum = minima
          .slice(index + 1)
          .reduce((a, b) => a + b, 0);
        const firstExtent = allocated
          .slice(0, index + 1)
          .reduce((a, b) => a + b, 0);
        result.dividers.push({
          groupId: node.id,
          index,
          axis: node.axis,
          groupRect: rect,
          rect: horizontal
            ? { ...rect, left: rect.left + offset, width: DIVIDER_PX }
            : { ...rect, top: rect.top + offset, height: DIVIDER_PX },
          sizes: allocated.map((value) => value / extent),
          savedSizes: node.sizes,
          minimumSizes: minima.map((value) => value / extent),
          ratio: firstExtent / extent,
          minimumRatio: firstMinimum / extent,
          maximumRatio: 1 - secondMinimum / extent,
        });
        offset += DIVIDER_PX;
      }
    }
    return true;
  }
  return visit(root, bounds) ? result : null;
}

/** Move one boundary while retaining feasible within-side ratios. */
export function resizeAtBoundary(
  divider: DividerRegion,
  requested: number,
): number[] {
  const ratio = Math.max(
    divider.minimumRatio,
    Math.min(divider.maximumRatio, requested),
  );
  const before = divider.sizes.slice(0, divider.index + 1);
  const after = divider.sizes.slice(divider.index + 1);
  return [
    ...(allocateExtents(
      ratio,
      before,
      divider.minimumSizes.slice(0, divider.index + 1),
    ) ?? before),
    ...(allocateExtents(
      1 - ratio,
      after,
      divider.minimumSizes.slice(divider.index + 1),
    ) ?? after),
  ];
}

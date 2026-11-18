import {
  copyExplicitExpansion,
  type ExplicitExpansionSnapshot,
} from "./explicitExpansion";
import {
  copyReadingPositions,
  type ViewReadingPositions,
} from "./readingPositions";
// Tree shape and normalized-size operations adapted from Paseo, Apache-2.0.
// Copyright (c) 2025-present Mohamed Boudra. See docs/conversation-layout-provenance.md.
import {
  CHANNEL_SEARCH_KEYS,
  type ChannelSearchKey,
} from "@/features/channels/ui/channelSearchKeys";

export const FIRST_SLICE_PANE_LIMIT = 2;
export type SplitAxis = "horizontal" | "vertical";
export type PanelKey = Exclude<ChannelSearchKey, "autoSend">;
export type PanelState = Partial<Record<PanelKey, string | null>>;
export type ScrollAnchor = { messageId: string; offset: number };
/** Explicit view-local choices only; automatic Smart/open state is visit-local. */
export type ViewPreferences = {
  timelineMode?: "threads" | "timeline";
  threadMode?: "focus" | "split";
  preferredThreadWidth?: number;
};
export function copyViewPreferences(value: ViewPreferences): ViewPreferences {
  return {
    ...(value.timelineMode === undefined
      ? {}
      : { timelineMode: value.timelineMode }),
    ...(value.threadMode === undefined ? {} : { threadMode: value.threadMode }),
    ...(value.preferredThreadWidth === undefined
      ? {}
      : { preferredThreadWidth: value.preferredThreadWidth }),
  };
}
export type ConversationView = {
  id: string;
  channelId: string;
  panelState: PanelState;
  preferences?: ViewPreferences;
  explicitExpansion?: ExplicitExpansionSnapshot;
  legacyExpansionOwner?: boolean;
  timelineAnchor: ScrollAnchor | null;
  threadAnchor: ScrollAnchor | null;
  readingPositions?: ViewReadingPositions;
};
export type PaneNode = { kind: "pane"; id: string; viewInstanceId: string };
export type GroupNode = {
  kind: "group";
  id: string;
  axis: SplitAxis;
  children: LayoutNode[];
  sizes: number[];
};
export type LayoutNode = PaneNode | GroupNode;
export type ConversationLayout = {
  version: 1;
  root: LayoutNode;
  focusedPaneId: string;
  views: Record<string, ConversationView>;
};
export type CreateId = (kind: "pane" | "group" | "view") => string;

/** Fresh presentation identity, deliberately unrelated to channel resource identity. */
export const createLayoutId: CreateId = (kind) =>
  `${kind}-${crypto.randomUUID()}`;

/** Copy only navigable presentation; never inherit an automatic send command. */
export function copyPanelState(state: PanelState): PanelState {
  const copy: PanelState = {};
  for (const key of CHANNEL_SEARCH_KEYS) {
    if (key === "autoSend") continue;
    const value = state[key];
    if (typeof value === "string" || value === null) copy[key] = value;
  }
  return copy;
}

/** Allocate a new view even if another instance already shows the same chat. */
export function createConversationView(
  channelId: string,
  ids: CreateId = createLayoutId,
  seed?: ConversationView,
): ConversationView {
  return {
    id: ids("view"),
    channelId,
    legacyExpansionOwner: false,
    panelState: copyPanelState(seed?.panelState ?? {}),
    ...(seed?.explicitExpansion
      ? { explicitExpansion: copyExplicitExpansion(seed.explicitExpansion) }
      : {}),
    ...(seed?.preferences
      ? { preferences: copyViewPreferences(seed.preferences) }
      : {}),
    timelineAnchor: seed?.timelineAnchor ? { ...seed.timelineAnchor } : null,
    ...(seed?.readingPositions
      ? { readingPositions: copyReadingPositions(seed.readingPositions) }
      : {}),
    threadAnchor: seed?.threadAnchor ? { ...seed.threadAnchor } : null,
  };
}

/** A safe initial layout; identity/community authorization is the caller's admission gate. */
export function createSingleLayout(
  view: ConversationView,
  ids: CreateId = createLayoutId,
): ConversationLayout {
  const paneId = ids("pane");
  return {
    version: 1,
    root: { kind: "pane", id: paneId, viewInstanceId: view.id },
    focusedPaneId: paneId,
    views: { [view.id]: view },
  };
}

/** Paseo's positive-weight normalization, with scaling to prevent finite-weight sum overflow. */
export function normalizeSizes(
  sizes: readonly number[],
  count: number,
): number[] {
  if (count <= 0) return [];
  const raw = Array.from({ length: count }, (_, index) => {
    const size = sizes[index];
    return Number.isFinite(size) && size > 0 ? size : 1;
  });
  const largest = Math.max(...raw);
  const scaled = raw.map((value) => Math.max(Number.EPSILON, value / largest));
  const total = scaled.reduce((sum, value) => sum + value, 0);
  return scaled.map((value) => value / total);
}

/** Ordered leaves, for focus traversal and later arbitrary topology. */
export function listPanes(root: LayoutNode): PaneNode[] {
  return root.kind === "pane" ? [root] : root.children.flatMap(listPanes);
}

function mapTree(
  node: LayoutNode,
  update: (node: LayoutNode) => LayoutNode,
): LayoutNode {
  if (node.kind === "pane") return update(node);
  const children = node.children.map((child) => mapTree(child, update));
  // Replacements are atomic: a split contains the original leaf and must not
  // recursively split that leaf again during the same action.
  return update(
    children.every((child, index) => child === node.children[index])
      ? node
      : { ...node, children },
  );
}

function nodeIds(root: LayoutNode): Set<string> {
  const ids = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    ids.add(node.id);
    if (node.kind === "group") pending.push(...node.children);
  }
  return ids;
}

/** First release permits one split via a capability limit, not a special two-slot model. */
export function splitPane(
  layout: ConversationLayout,
  targetPaneId: string,
  view: ConversationView,
  axis: SplitAxis,
  ids: CreateId = createLayoutId,
  paneLimit = FIRST_SLICE_PANE_LIMIT,
): ConversationLayout {
  const panes = listPanes(layout.root);
  if (
    panes.length >= paneLimit ||
    !panes.some((pane) => pane.id === targetPaneId) ||
    Object.hasOwn(layout.views, view.id)
  )
    return layout;
  const paneId = ids("pane");
  const groupId = ids("group");
  const existing = nodeIds(layout.root);
  if (existing.has(paneId) || existing.has(groupId) || paneId === groupId)
    return layout;
  const root = mapTree(layout.root, (node) =>
    node.kind === "pane" && node.id === targetPaneId
      ? {
          kind: "group",
          id: groupId,
          axis,
          sizes: [0.5, 0.5],
          children: [
            node,
            { kind: "pane", id: paneId, viewInstanceId: view.id },
          ],
        }
      : node,
  );
  return {
    ...layout,
    root,
    focusedPaneId: paneId,
    views: { ...layout.views, [view.id]: view },
  };
}

function removeFromTree(node: LayoutNode, paneId: string): LayoutNode | null {
  if (node.kind === "pane") return node.id === paneId ? null : node;
  const kept = node.children.flatMap((child, index) => {
    const next = removeFromTree(child, paneId);
    return next ? [{ node: next, size: node.sizes[index] }] : [];
  });
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0].node;
  if (
    kept.every((entry, index) => entry.node === node.children[index]) &&
    kept.length === node.children.length
  )
    return node;
  return {
    ...node,
    children: kept.map((entry) => entry.node),
    sizes: normalizeSizes(
      kept.map((entry) => entry.size),
      kept.length,
    ),
  };
}

/** Close only a presentation instance; the final view and canonical drafts are never removed. */
export function closePane(
  layout: ConversationLayout,
  paneId: string,
): ConversationLayout {
  const panes = listPanes(layout.root);
  const pane = panes.find((candidate) => candidate.id === paneId);
  if (!pane || panes.length === 1) return layout;
  const root = removeFromTree(layout.root, paneId);
  if (!root) return layout;
  const views = { ...layout.views };
  delete views[pane.viewInstanceId];
  return {
    ...layout,
    root,
    views,
    focusedPaneId:
      paneId === layout.focusedPaneId
        ? listPanes(root)[0].id
        : layout.focusedPaneId,
  };
}

/** Swap instances with their state and focus, leaving geometry and stable view IDs intact. */
export function swapPanes(
  layout: ConversationLayout,
  firstId: string,
  secondId: string,
): ConversationLayout {
  if (firstId === secondId) return layout;
  const panes = listPanes(layout.root);
  const first = panes.find((pane) => pane.id === firstId);
  const second = panes.find((pane) => pane.id === secondId);
  if (!first || !second) return layout;
  const root = mapTree(layout.root, (node) =>
    node.kind !== "pane"
      ? node
      : node.id === firstId
        ? { ...node, viewInstanceId: second.viewInstanceId }
        : node.id === secondId
          ? { ...node, viewInstanceId: first.viewInstanceId }
          : node,
  );
  const focusedPaneId =
    layout.focusedPaneId === firstId
      ? secondId
      : layout.focusedPaneId === secondId
        ? firstId
        : layout.focusedPaneId;
  return { ...layout, root, focusedPaneId };
}

/** Focus is explicit; pointer hover and incoming messages must not call this action. */
export function focusPane(
  layout: ConversationLayout,
  paneId: string,
): ConversationLayout {
  return layout.focusedPaneId === paneId ||
    !listPanes(layout.root).some((pane) => pane.id === paneId)
    ? layout
    : { ...layout, focusedPaneId: paneId };
}

/** Resize an arbitrary group without changing mounted view identities. */
export function resizeGroup(
  layout: ConversationLayout,
  groupId: string,
  sizes: number[],
): ConversationLayout {
  const root = mapTree(layout.root, (node) => {
    if (node.kind !== "group" || node.id !== groupId) return node;
    const next = normalizeSizes(sizes, node.children.length);
    return next.every((value, index) => value === node.sizes[index])
      ? node
      : { ...node, sizes: next };
  });
  return root === layout.root ? layout : { ...layout, root };
}

/** Orientation changes reuse the same instances and normalized ratio. */
export function orientGroup(
  layout: ConversationLayout,
  groupId: string,
  axis: SplitAxis,
): ConversationLayout {
  const root = mapTree(layout.root, (node) =>
    node.kind === "group" && node.id === groupId && node.axis !== axis
      ? { ...node, axis }
      : node,
  );
  return root === layout.root ? layout : { ...layout, root };
}

/** Restore a saved chat presentation inside a view; caller flushes/guards the outgoing editor first. */
export function navigateView(
  layout: ConversationLayout,
  viewId: string,
  channelId: string,
  presentation?: Pick<
    ConversationView,
    | "panelState"
    | "timelineAnchor"
    | "threadAnchor"
    | "preferences"
    | "explicitExpansion"
    | "readingPositions"
  >,
): ConversationLayout {
  if (!Object.hasOwn(layout.views, viewId)) return layout;
  const next: ConversationView = {
    id: viewId,
    channelId,
    ...(layout.views[viewId].legacyExpansionOwner === undefined
      ? {}
      : { legacyExpansionOwner: layout.views[viewId].legacyExpansionOwner }),
    panelState: copyPanelState(presentation?.panelState ?? {}),
    ...(presentation?.explicitExpansion
      ? {
          explicitExpansion: copyExplicitExpansion(
            presentation.explicitExpansion,
          ),
        }
      : {}),
    ...(presentation?.preferences
      ? { preferences: copyViewPreferences(presentation.preferences) }
      : {}),
    timelineAnchor: presentation?.timelineAnchor
      ? { ...presentation.timelineAnchor }
      : null,
    ...(presentation?.readingPositions
      ? {
          readingPositions: copyReadingPositions(presentation.readingPositions),
        }
      : {}),
    threadAnchor: presentation?.threadAnchor
      ? { ...presentation.threadAnchor }
      : null,
  };
  return { ...layout, views: { ...layout.views, [viewId]: next } };
}

/** Fence delayed view callbacks by resource so an old chat cannot overwrite its replacement. */
export function updateViewPresentation(
  layout: ConversationLayout,
  viewId: string,
  expectedChannelId: string,
  patch: Partial<
    Pick<
      ConversationView,
      | "panelState"
      | "timelineAnchor"
      | "threadAnchor"
      | "preferences"
      | "explicitExpansion"
      | "readingPositions"
    >
  >,
): ConversationLayout {
  const view = Object.hasOwn(layout.views, viewId)
    ? layout.views[viewId]
    : undefined;
  if (!view || view.channelId !== expectedChannelId) return layout;
  const next = {
    ...view,
    ...patch,
    ...(patch.readingPositions
      ? { readingPositions: copyReadingPositions(patch.readingPositions) }
      : {}),
    ...(patch.explicitExpansion
      ? { explicitExpansion: copyExplicitExpansion(patch.explicitExpansion) }
      : {}),
    ...(patch.preferences
      ? {
          preferences: copyViewPreferences({
            ...view.preferences,
            ...patch.preferences,
          }),
        }
      : {}),
    panelState: patch.panelState
      ? copyPanelState({ ...view.panelState, ...patch.panelState })
      : view.panelState,
    timelineAnchor:
      patch.timelineAnchor === undefined
        ? view.timelineAnchor
        : patch.timelineAnchor
          ? { ...patch.timelineAnchor }
          : null,
    threadAnchor:
      patch.threadAnchor === undefined
        ? view.threadAnchor
        : patch.threadAnchor
          ? { ...patch.threadAnchor }
          : null,
  };
  return { ...layout, views: { ...layout.views, [viewId]: next } };
}

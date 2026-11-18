import {
  isExplicitExpansionSnapshot,
  type ExplicitExpansionSnapshot,
} from "./explicitExpansion";
import { z } from "zod";
import {
  isViewReadingPositions,
  type ViewReadingPositions,
} from "./readingPositions";
import { CHANNEL_SEARCH_KEYS } from "@/features/channels/ui/channelSearchKeys";
import {
  FIRST_SLICE_PANE_LIMIT,
  listPanes,
  normalizeSizes,
  type ConversationLayout,
  type LayoutNode,
} from "./model";

export const MAX_LAYOUT_BYTES = 128 * 1024;
const MAX_NODES = 63;
const MAX_DEPTH = 16;
const identifier = z.string().min(1).max(256);
const panelShape = Object.fromEntries(
  CHANNEL_SEARCH_KEYS.filter((key) => key !== "autoSend").map((key) => [
    key,
    z.string().max(1024).nullable().optional(),
  ]),
);
const anchor = z
  .object({ messageId: identifier, offset: z.number().finite() })
  .strict()
  .nullable();
export const conversationViewSchema = z
  .object({
    id: identifier,
    channelId: identifier,
    panelState: z.object(panelShape).strict(),
    legacyExpansionOwner: z.boolean().optional(),
    explicitExpansion: z
      .custom<ExplicitExpansionSnapshot>(isExplicitExpansionSnapshot)
      .optional(),
    preferences: z
      .object({
        timelineMode: z.enum(["threads", "timeline"]).optional(),
        threadMode: z.enum(["focus", "split"]).optional(),
        // Preferred width is projected against the live leaf; never persist its clamp.
        preferredThreadWidth: z.number().finite().min(320).max(4096).optional(),
      })
      .strict()
      .optional(),
    timelineAnchor: anchor,
    threadAnchor: anchor,
    readingPositions: z
      .custom<ViewReadingPositions>(isViewReadingPositions)
      .optional(),
  })
  .strict();
const node: z.ZodType<LayoutNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("pane"),
        id: identifier,
        viewInstanceId: identifier,
      })
      .strict(),
    z
      .object({
        kind: z.literal("group"),
        id: identifier,
        axis: z.enum(["horizontal", "vertical"]),
        children: z.array(node).min(1).max(32),
        sizes: z.array(z.number().finite().positive()).min(1).max(32),
      })
      .strict(),
  ]),
);
const schema = z
  .object({
    version: z.literal(1),
    root: node,
    focusedPaneId: identifier,
    views: z.record(identifier, conversationViewSchema),
  })
  .strict();

/** Bound work and reject object cycles before entering a recursive schema. */
function boundedTree(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const seen = new Set<object>();
  const pending = [{ node: (input as { root?: unknown }).root, depth: 0 }];
  while (pending.length) {
    const entry = pending.pop();
    if (!entry?.node || typeof entry.node !== "object") return false;
    if (
      entry.depth > MAX_DEPTH ||
      seen.has(entry.node) ||
      seen.size >= MAX_NODES
    )
      return false;
    seen.add(entry.node);
    const children = (entry.node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      if (children.length > 32) return false;
      for (const child of children)
        pending.push({ node: child, depth: entry.depth + 1 });
    }
  }
  return true;
}

/** Shape validation alone cannot prove tree/view identity or release capabilities. */
export function validateLayout(
  input: unknown,
  paneLimit = FIRST_SLICE_PANE_LIMIT,
): ConversationLayout | null {
  if (!boundedTree(input)) return null;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const layout = parsed.data;
  if (
    Object.values(layout.views).filter(
      (view) => view.legacyExpansionOwner === true,
    ).length > 1
  )
    return null;
  const ids = new Set<string>();
  let valid = true;
  const normalize = (current: LayoutNode): LayoutNode => {
    if (ids.has(current.id)) valid = false;
    ids.add(current.id);
    if (current.kind === "pane") return current;
    if (current.children.length !== current.sizes.length) valid = false;
    const children = current.children.map(normalize);
    return children.length === 1
      ? children[0]
      : {
          ...current,
          children,
          sizes: normalizeSizes(current.sizes, children.length),
        };
  };
  const root = normalize(layout.root);
  const panes = listPanes(root);
  if (
    !valid ||
    panes.length > paneLimit ||
    !Number.isInteger(paneLimit) ||
    paneLimit < 1
  )
    return null;
  const referenced = new Set<string>();
  for (const pane of panes) {
    if (
      referenced.has(pane.viewInstanceId) ||
      !Object.hasOwn(layout.views, pane.viewInstanceId)
    )
      return null;
    const instance = layout.views[pane.viewInstanceId];
    if (instance.id !== pane.viewInstanceId) return null;
    referenced.add(instance.id);
  }
  if (Object.keys(layout.views).length !== referenced.size) return null;
  return {
    ...layout,
    root,
    focusedPaneId: panes.some((pane) => pane.id === layout.focusedPaneId)
      ? layout.focusedPaneId
      : panes[0].id,
  };
}

export function parseLayout(
  raw: string,
  paneLimit = FIRST_SLICE_PANE_LIMIT,
): ConversationLayout | null {
  if (raw.length > MAX_LAYOUT_BYTES) return null;
  try {
    return validateLayout(JSON.parse(raw), paneLimit);
  } catch {
    return null;
  }
}

import type { TimelineMessage } from "../types";
import type { MainTimelineEntry } from "./threadPanel";

export const DISPATCH_ORIGIN_TAG = "origin";
const CHANNEL_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only explicit routing from the main composer creates a shared same-channel trace. */
export function dispatchOriginTags(
  channelId: string | null,
  chosenId: string | null | undefined,
  threadScoped: boolean,
): string[][] {
  return channelId &&
    CHANNEL_ID.test(channelId) &&
    typeof chosenId === "string" &&
    chosenId.length > 0 &&
    !threadScoped
    ? [[DISPATCH_ORIGIN_TAG, channelId, "main"]]
    : [];
}

/** The dedicated native argument validates this again against the signed h and reply. */
export function partitionDispatchOriginTags(
  tags: readonly string[][] | undefined,
): { dispatchOriginTag: string[] | undefined; otherTags: string[][] } {
  const origin = (tags ?? []).filter((tag) => tag[0] === DISPATCH_ORIGIN_TAG);
  if (
    origin.length > 1 ||
    origin.some(
      (tag) =>
        tag.length !== 3 || !CHANNEL_ID.test(tag[1]) || tag[2] !== "main",
    )
  )
    throw new Error("Invalid dispatch origin provenance.");
  return {
    dispatchOriginTag: origin[0],
    otherTags: (tags ?? []).filter((tag) => tag[0] !== DISPATCH_ORIGIN_TAG),
  };
}

/** Signed provenance is same-channel only; unknown/multiple/foreign h tags fail closed. */
export function getDispatchOrigin(
  message: TimelineMessage,
  channelId: string | null | undefined,
): string | null {
  if (
    !channelId ||
    !message.parentId ||
    message.pending ||
    message.id.startsWith("outbox-local:") ||
    ![9, 40002].includes(message.kind ?? 9)
  )
    return null;
  const origins =
    message.tags?.filter((tag) => tag[0] === DISPATCH_ORIGIN_TAG) ?? [];
  const scopes = message.tags?.filter((tag) => tag[0] === "h") ?? [];
  return origins.length === 1 &&
    scopes.length === 1 &&
    scopes[0].length === 2 &&
    scopes[0][1] === channelId &&
    origins[0].length === 3 &&
    origins[0][1] === channelId &&
    origins[0][2] === "main" &&
    CHANNEL_ID.test(channelId)
    ? channelId
    : null;
}

/** A derived row, never a second event or a reply/counter/unread authority. */
export function withDispatchTraces(
  entries: readonly MainTimelineEntry[],
  messages: readonly TimelineMessage[],
  channelId: string | null | undefined,
): MainTimelineEntry[] {
  const ids = new Set(entries.map((entry) => entry.message.id));
  const byId = new Map(messages.map((message) => [message.id, message]));
  const traces: MainTimelineEntry[] = [];
  for (const message of byId.values()) {
    if (ids.has(message.id) || !getDispatchOrigin(message, channelId)) continue;
    const rootId = message.rootId ?? message.parentId;
    traces.push({
      message,
      summary: null,
      dispatchTrace: { root: rootId ? (byId.get(rootId) ?? null) : null },
    });
    ids.add(message.id);
  }
  return [...entries, ...traces].sort(
    (a, b) =>
      a.message.createdAt - b.message.createdAt ||
      a.message.id.localeCompare(b.message.id),
  );
}

/** Editing a queued body cannot erase or introduce its immutable routing provenance. */
export function retainDispatchOriginForEdit(
  original: readonly string[][],
  replacement: readonly string[][],
): string[][] {
  const { dispatchOriginTag } = partitionDispatchOriginTags(original);
  return [
    ...replacement.filter((tag) => tag[0] !== DISPATCH_ORIGIN_TAG),
    ...(dispatchOriginTag ? [dispatchOriginTag] : []),
  ];
}

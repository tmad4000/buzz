import type { RelayEvent } from "@/shared/api/types";
import { mergeMessages } from "./messageMerge";
import { sortMessages } from "./messageQueryKeys";
import type { TimelineMessage } from "../types";
import type { MainTimelineEntry } from "./threadPanel";

/** Flatten presentation only: retain signed reply references and original timestamps. */
export function buildFlatTimelineEntries(
  messages: readonly TimelineMessage[],
): MainTimelineEntry[] {
  return [...messages]
    .sort(
      (a, b) =>
        a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((message) => ({ message: { ...message, depth: 0 }, summary: null }));
}

/** Batch settled history once; retain the existing optimistic-send reconciliation. */
export function mergeTimelineReplyEvents(
  channel: RelayEvent[],
  replies: RelayEvent[],
): RelayEvent[] {
  return channel.some((event) => event.pending) ||
    replies.some((event) => event.pending)
    ? replies.reduce(mergeMessages, channel)
    : sortMessages([...channel, ...replies]);
}

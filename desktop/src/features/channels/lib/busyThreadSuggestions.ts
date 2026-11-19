import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";
import type { OpenThreadPin } from "./openThreadPins";

export const BUSY_REPLY_THRESHOLDS = [5, 10, 20, 50, 100] as const;
export const DEFAULT_BUSY_REPLY_THRESHOLD = 20;
/** Presentation preference only; no reply counts are persisted. */
export function parseBusyReplyThreshold(value: unknown): number {
  const count = Number(value);
  return BUSY_REPLY_THRESHOLDS.some((option) => option === count)
    ? count
    : DEFAULT_BUSY_REPLY_THRESHOLD;
}

/** Loaded canonical roots only. Existing summaries supply total reply evidence;
 * lastReplyAt alone cannot establish a 24h velocity and is never used as one.
 */
export function selectBusyThreadSuggestions(
  entries: readonly MainTimelineEntry[],
  pins: readonly OpenThreadPin[],
  dismissed: ReadonlySet<string>,
  threshold = DEFAULT_BUSY_REPLY_THRESHOLD,
  summaries?: ReadonlyMap<string, ChannelWindowThreadSummary>,
) {
  const pinned = new Set(pins.map((pin) => pin.id));
  const candidates = new Map<
    string,
    { message: MainTimelineEntry["message"]; replyCount: number }
  >();
  for (const entry of entries) {
    const message = entry.message;
    if (
      message.parentId ||
      message.pending ||
      message.id.startsWith("optimistic-") ||
      pinned.has(message.id) ||
      dismissed.has(message.id)
    )
      continue;
    const replyCount = Math.max(
      entry.summary?.replyCount ?? 0,
      summaries?.get(message.id)?.descendantCount ?? 0,
    );
    if (
      !Number.isFinite(replyCount) ||
      replyCount < parseBusyReplyThreshold(threshold)
    )
      continue;
    candidates.set(message.id, { message, replyCount });
  }
  return [...candidates.values()].slice(0, 3);
}

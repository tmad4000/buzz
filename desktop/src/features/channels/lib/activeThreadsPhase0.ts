import type { ChannelWindowThreadSummary } from "@/features/messages/lib/channelWindowStore";
import type { MainTimelineEntry } from "@/features/messages/lib/threadPanel";
import type { OpenThreadPin } from "./openThreadPins";
import { BUSY_REPLY_THRESHOLDS } from "./busyThreadSuggestions";

export type ActiveThreadPreferences = { enabled: boolean; threshold: number };
export const DEFAULT_ACTIVE_THREAD_PREFERENCES: ActiveThreadPreferences = {
  enabled: true,
  threshold: 10,
};
export function parseActiveThreadPreferences(
  raw: string | null,
): ActiveThreadPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    return {
      enabled: typeof value?.enabled === "boolean" ? value.enabled : true,
      threshold: BUSY_REPLY_THRESHOLDS.includes(value?.threshold)
        ? value.threshold
        : 10,
    };
  } catch {
    return { ...DEFAULT_ACTIVE_THREAD_PREFERENCES };
  }
}
export type ActivityBand =
  | "Today"
  | "Last 2 days"
  | "Older"
  | "Outside loaded history";
export type ActiveThreadRow = OpenThreadPin & {
  automatic: boolean;
  activity: number | null;
  messageCount: number | null;
  band: ActivityBand;
};
export const ACTIVITY_BANDS: ActivityBand[] = [
  "Today",
  "Last 2 days",
  "Older",
  "Outside loaded history",
];
function bandFor(activity: number | null, now: number): ActivityBand {
  if (activity === null) return "Outside loaded history";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const recent = new Date(today);
  recent.setDate(recent.getDate() - 2);
  return activity * 1000 >= today.getTime()
    ? "Today"
    : activity * 1000 >= recent.getTime()
      ? "Last 2 days"
      : "Older";
}
/** Read-only membership from canonical loaded roots and their existing summaries.
 * No pin writes, work-status inference, relay fetch or lifecycle side effects. */
export function activeThreadRows(
  entries: readonly MainTimelineEntry[],
  pins: readonly OpenThreadPin[],
  dismissed: ReadonlySet<string>,
  preferences: ActiveThreadPreferences,
  now: number,
  summaries?: ReadonlyMap<string, ChannelWindowThreadSummary>,
): ActiveThreadRow[] {
  const roots = new Map(
    entries
      .filter(
        ({ message }) =>
          !message.parentId &&
          !message.pending &&
          !message.id.startsWith("optimistic-") &&
          !message.id.startsWith("outbox-local:"),
      )
      .map((entry) => [entry.message.id, entry]),
  );
  const pinned = new Set(pins.map(({ id }) => id));
  const describe = (
    pin: OpenThreadPin,
    automatic: boolean,
  ): ActiveThreadRow => {
    const entry = roots.get(pin.id);
    const summary = summaries?.get(pin.id);
    const counts = [
      entry?.summary?.replyCount,
      summary?.descendantCount,
    ].filter(
      (n): n is number =>
        typeof n === "number" && Number.isSafeInteger(n) && n >= 0,
    );
    const times = [
      entry?.message.createdAt,
      entry?.summary?.lastReplyAt,
      summary?.lastReplyAt,
    ].filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0,
    );
    const activity = entry && times.length ? Math.max(...times) : null;
    return {
      ...pin,
      automatic,
      activity,
      messageCount: entry ? 1 + Math.max(0, ...counts) : null,
      band: bandFor(activity, now),
    };
  };
  const rows = pins.map((pin) => describe(pin, false));
  if (preferences.enabled) {
    for (const { message } of roots.values()) {
      if (pinned.has(message.id) || dismissed.has(message.id)) continue;
      const row = describe(
        { id: message.id, title: message.body.split("\n")[0].slice(0, 240) },
        true,
      );
      if ((row.messageCount ?? 0) >= preferences.threshold) rows.push(row);
    }
  }
  return rows.sort(
    (a, b) =>
      ACTIVITY_BANDS.indexOf(a.band) - ACTIVITY_BANDS.indexOf(b.band) ||
      (b.activity ?? 0) - (a.activity ?? 0) ||
      a.id.localeCompare(b.id),
  );
}

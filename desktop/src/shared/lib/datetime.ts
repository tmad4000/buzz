import { relativeUpdated } from "./appBuild";
/**
 * Relative date labels shared by the chat timeline and the Inbox.
 *
 * Both surfaces group items by calendar day and label the group. They used to
 * do it independently — chat via `messages/lib/dateFormatters.formatDayHeading`,
 * the Inbox inline inside `groupInboxItems` — and the two drifted apart: chat
 * appended an ordinal ("Monday, March 31st") while the Inbox always printed the
 * year ("Jul 8, 2026", even for a date three weeks ago).
 *
 * The ladder follows the Block writing standard for relative dates, with one
 * deliberate deviation noted on `formatDayGroupLabel`.
 */

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
});

const WEEKDAY_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const MONTH_DAY_YEAR_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** Days in a week, past which the weekday name stops being unambiguous. */
const WEEKDAY_BAND_DAYS = 7;

/**
 * Label for a group of items that share a calendar day — a chat day divider or
 * an Inbox section header.
 *
 * ```
 * Today          → "Today"
 * Yesterday      → "Yesterday"
 * 2–6 days ago   → "Monday"
 * older, this year → "Saturday, June 20"
 * earlier years  → "June 20, 2025"
 * ```
 *
 * The weekday rides along within the current year — feedback was that it still
 * orients ("was that a weekend?") well past the six-day band. Beyond a year it
 * stops earning its width: nobody maps "Friday" to anything a year later, and
 * the year itself needs the room.
 *
 * Deliberate deviation from the standard: the standard collapses anything over
 * ten months old to month and year ("Aug 2022"). A group label has to *identify*
 * its day — collapsing would give every day in a month the same header, so
 * scrolling old history would show a run of identical dividers with no way to
 * tell one day from the next. The day is kept and only the year is conditional.
 *
 * No ordinal suffix ("June 20", never "June 20th"), per the standard.
 *
 * `nowSeconds` is injectable so the relative bands are testable; it must stay a
 * parameter rather than a captured constant, because a label rendered before
 * midnight has to say "Yesterday" once the day rolls over.
 */
export function formatDayGroupLabel(
  unixSeconds: number,
  nowSeconds = Date.now() / 1_000,
): string {
  const date = new Date(unixSeconds * 1_000);
  const now = new Date(nowSeconds * 1_000);
  const dayDiff = calendarDaysBetween(now, date);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  // Bounded below as well as above: a timestamp in the future (clock skew, or a
  // relay ahead of this machine) must not be labelled with a weekday that reads
  // as the recent past.
  if (dayDiff > 1 && dayDiff < WEEKDAY_BAND_DAYS) {
    return WEEKDAY_FORMATTER.format(date);
  }

  return date.getFullYear() === now.getFullYear()
    ? WEEKDAY_MONTH_DAY_FORMATTER.format(date)
    : MONTH_DAY_YEAR_FORMATTER.format(date);
}

/** Shared relative-first labels. Exact local time belongs in the surface tooltip. */
export function formatItemTimestamp(
  unixSeconds: number,
  {
    withTime = false,
    nowSeconds = Date.now() / 1_000,
  }: { withTime?: boolean; nowSeconds?: number } = {},
): string {
  void withTime;
  return relativeUpdated(
    new Date(unixSeconds * 1000).toISOString(),
    nowSeconds * 1000,
  );
}

/** Local midnight of the calendar day containing `date`. */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Whole calendar days from `date` to `now`, in local time. Rounded rather than
 * floored so a DST transition — a 23- or 25-hour day — still counts as one day.
 */
function calendarDaysBetween(now: Date, date: Date): number {
  return Math.round(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) /
      86_400_000,
  );
}

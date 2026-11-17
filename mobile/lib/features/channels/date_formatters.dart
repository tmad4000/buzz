import '../../shared/utils/relative_time.dart';
import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';

// Re-export shortPubkey so existing callers continue to compile.
export '../../shared/utils/string_utils.dart' show shortPubkey;

final _weekdayFormat = DateFormat('EEEE');
final _weekdayMonthDayFormat = DateFormat('EEEE, MMMM d');
final _monthDayYearFormat = DateFormat('MMMM d, y');

/// Days in a week, past which the weekday name stops being unambiguous.
const _weekdayBandDays = 7;

/// Label for a day divider: "Today", "Yesterday", "Monday",
/// "Tuesday, March 31", or "March 31, 2025".
///
/// ```
/// Today            → "Today"
/// Yesterday        → "Yesterday"
/// 2–6 days ago     → "Monday"
/// older, this year → "Tuesday, March 31"
/// earlier years    → "March 31, 2025"
/// ```
///
/// The weekday rides along within the current year — it still orients ("was
/// that a weekend?") well past the six-day band. Beyond a year it stops
/// earning its width, and the year takes its place.
///
/// Mirrors `formatDayGroupLabel` in `desktop/src/shared/lib/datetime.ts`,
/// including its two departures from the Block writing standard: the day is
/// kept in the oldest band rather than collapsing to month-and-year, because a
/// divider has to *identify* its day — collapsing would give every day in a
/// month the same header. And there is no ordinal suffix ("March 31", never
/// "March 31st"), which the standard does ask for.
///
/// [now] is exposed for testing; production callers should omit it.
String formatDayHeading(int unixSeconds, {@visibleForTesting DateTime? now}) {
  final date = DateTime.fromMillisecondsSinceEpoch(
    unixSeconds * 1000,
    isUtc: true,
  ).toLocal();
  now ??= DateTime.now();
  final dayDiff = _calendarDaysBetween(now, date);

  if (dayDiff == 0) return 'Today';
  if (dayDiff == 1) return 'Yesterday';
  // Bounded below as well as above: a timestamp in the future (clock skew, or a
  // relay ahead of this device) must not be labelled with a weekday that reads
  // as the recent past.
  if (dayDiff > 1 && dayDiff < _weekdayBandDays) {
    return _weekdayFormat.format(date);
  }

  return date.year == now.year
      ? _weekdayMonthDayFormat.format(date)
      : _monthDayYearFormat.format(date);
}

/// Whole calendar days from [date] to [now], in local time. Rounded rather than
/// truncated so a DST transition — a 23- or 25-hour day — still counts as one.
int _calendarDaysBetween(DateTime now, DateTime date) {
  final startOfNow = DateTime(now.year, now.month, now.day);
  final startOfDate = DateTime(date.year, date.month, date.day);
  return (startOfNow.difference(startOfDate).inHours / 24).round();
}

/// Whether two unix-second timestamps fall on the same calendar day (local time).
bool isSameDay(int a, int b) {
  final dtA = DateTime.fromMillisecondsSinceEpoch(
    a * 1000,
    isUtc: true,
  ).toLocal();
  final dtB = DateTime.fromMillisecondsSinceEpoch(
    b * 1000,
    isUtc: true,
  ).toLocal();
  return dtA.year == dtB.year && dtA.month == dtB.month && dtA.day == dtB.day;
}

/// Returns a compact relative time string like "just now", "5m ago", "3h ago",
/// "2d ago", or a short date for older timestamps.
String relativeTime(int unixSeconds) => relativeTimestamp(unixSeconds);

/// Returns desktop-parity thread activity copy such as "just now",
/// "3 hours ago", or "on May 19".
String formatThreadSummaryLastReplyTime(
  int unixSeconds, {
  @visibleForTesting int? nowSeconds,
}) => relativeTimestamp(unixSeconds, nowSeconds: nowSeconds);

/// Compact relative-first message time; exact time belongs in the tooltip.
String formatMessageTime(int unixSeconds) => relativeTimestamp(unixSeconds);

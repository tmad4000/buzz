import 'package:intl/intl.dart';

/// Shared relative-first time, with a named month from seven days onward.
String relativeTimestamp(int unixSeconds, {int? nowSeconds}) {
  final now = nowSeconds == null
      ? DateTime.now()
      : DateTime.fromMillisecondsSinceEpoch(nowSeconds * 1000);
  final date = DateTime.fromMillisecondsSinceEpoch(
    unixSeconds * 1000,
    isUtc: true,
  ).toLocal();
  final diff = now.difference(date);
  if (diff.inMinutes < 1) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
  if (diff.inHours < 24) return '${diff.inHours}h ago';
  if (diff.inDays < 7) return '${diff.inDays}d ago';
  return DateFormat(date.year == now.year ? 'MMM d' : 'MMM d, y').format(date);
}

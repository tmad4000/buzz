import 'package:flutter/foundation.dart';

/// Message-search operators split out of a free-text query. Mirrors desktop's
/// `parseSearchOperators.ts` so the same text means the same on both.
@immutable
class SearchOperators {
  /// Query text with the operators removed.
  final String text;

  /// Raw `from:` value, unquoted.
  final String? from;

  /// Raw `in:` value, unquoted.
  final String? inChannel;

  /// Inclusive unix seconds from `after:YYYY-MM-DD`.
  final int? since;

  /// Inclusive unix seconds from `before:YYYY-MM-DD` (that day excluded).
  final int? until;

  const SearchOperators({
    required this.text,
    this.from,
    this.inChannel,
    this.since,
    this.until,
  });

  bool get isEmpty =>
      from == null && inChannel == null && since == null && until == null;

  /// Splits [raw]. Later operators win; invalid dates stay in [text].
  factory SearchOperators.parse(String raw) {
    String? from;
    String? inChannel;
    int? since;
    int? until;
    final text = raw.replaceAllMapped(_operator, (match) {
      final value = _cleanValue(match[2]!);
      switch (match[1]!.toLowerCase()) {
        case 'from':
          from = value;
        case 'in':
          inChannel = value;
        case 'after':
          final day = parseOperatorDay(value);
          if (day == null) return match[0]!;
          since = _seconds(day);
        case 'before':
          final day = parseOperatorDay(value);
          if (day == null) return match[0]!;
          // NIP-01 `until` is inclusive; keep the named day out.
          until = _seconds(day) - 1;
      }
      return '';
    });
    return SearchOperators(
      text: text.replaceAll(_spaces, ' ').trim(),
      from: from,
      inChannel: inChannel,
      since: since,
      until: until,
    );
  }

  static final _operator = RegExp(
    r'(?:^|\s)(from|in|after|before):("[^"]+"|\S+)',
    caseSensitive: false,
  );
  static final _spaces = RegExp(r'\s+');
  static final _trailing = RegExp(r'[.,;:!?]+$');

  static String _cleanValue(String value) =>
      value.length > 2 && value.startsWith('"') && value.endsWith('"')
      ? value.substring(1, value.length - 1)
      : value.replaceAll(_trailing, '');

  static int _seconds(DateTime day) => day.millisecondsSinceEpoch ~/ 1000;
}

/// Local midnight of a valid `YYYY-MM-DD`, else null.
DateTime? parseOperatorDay(String value) {
  final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(value);
  if (match == null) return null;
  final (year, month, day) = (
    int.parse(match[1]!),
    int.parse(match[2]!),
    int.parse(match[3]!),
  );
  final date = DateTime(year, month, day);
  return date.year == year && date.month == month && date.day == day
      ? date
      : null;
}

/// Local calendar day as the `YYYY-MM-DD` the date operators accept.
String toOperatorDay(DateTime date) =>
    '${date.year.toString().padLeft(4, '0')}-'
    '${date.month.toString().padLeft(2, '0')}-'
    '${date.day.toString().padLeft(2, '0')}';

/// Text for [value] that parses back exactly, or null if it cannot be written.
String? formatOperatorValue(String value) {
  if (value.isEmpty || value.contains('"')) return null;
  return RegExp(r'\s|[.,;:!?]$').hasMatch(value) ? '"$value"' : value;
}

/// Replaces every [kind] operator in [raw], or removes it for a null [value].
String setSearchOperator(String raw, String kind, String? value) {
  final kept = raw
      .replaceAll(
        RegExp('(?:^|\\s)$kind:(?:"[^"]+"|\\S+)', caseSensitive: false),
        '',
      )
      .trim();
  final formatted = value == null ? null : formatOperatorValue(value);
  if (formatted == null) return kept;
  return '${kept.isEmpty ? '' : '$kept '}$kind:$formatted ';
}

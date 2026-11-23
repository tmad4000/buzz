import 'package:buzz/features/search/search_operators.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('splits operators and keeps the remaining text', () {
    final parsed = SearchOperators.parse(
      'deploy from:"@Will Pfleger" in:#general, after:2026-01-05 '
      'before:2026-01-10 status built-in:react',
    );
    expect(parsed.text, 'deploy status built-in:react');
    expect(parsed.from, '@Will Pfleger');
    expect(parsed.inChannel, '#general');
    expect(parsed.since, DateTime(2026, 1, 5).millisecondsSinceEpoch ~/ 1000);
    // `before:` excludes the named day; `until` is inclusive.
    expect(
      parsed.until,
      DateTime(2026, 1, 10).millisecondsSinceEpoch ~/ 1000 - 1,
    );
  });

  test('invalid dates stay searchable text', () {
    final parsed = SearchOperators.parse(
      'notes after:yesterday before:2026-02-30',
    );
    expect(parsed.text, 'notes after:yesterday before:2026-02-30');
    expect(parsed.isEmpty, isTrue);
  });

  test('written operators read back exactly and replace earlier ones', () {
    for (final value in ['@Will Pfleger', '#general', 'what?', 'a:b', '日本']) {
      final query = setSearchOperator('deploy from:x', 'from', value);
      final parsed = SearchOperators.parse(query);
      expect(parsed.from, value);
      expect(parsed.text, 'deploy');
    }
    expect(formatOperatorValue('say "hi"'), isNull);
    expect(
      setSearchOperator('from:a deploy in:#x', 'in', null),
      'from:a deploy',
    );
  });
}

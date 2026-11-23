import 'dart:math' as math;

import 'package:buzz/features/search/search_by_date.dart';
import 'package:buzz/features/search/search_sort_support.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';

NostrEvent _event(int id, int createdAt) => NostrEvent(
  id: '$id'.padLeft(6, '0'),
  pubkey: 'a' * 64,
  createdAt: createdAt,
  kind: 9,
  tags: const [],
  content: '',
  sig: '',
);

/// The relay's contract: filter by window, rank, then truncate (query.rs).
class _Relay {
  final List<NostrEvent> corpus;
  final num Function(NostrEvent) rank;
  final bool supportsSort;
  final requests = <SearchPageRequest>[];

  _Relay(this.corpus, {required this.rank, this.supportsSort = false});

  Future<List<NostrEvent>> fetch(SearchPageRequest request) async {
    requests.add(request);
    final newest = compareByDate(SearchSort.newest);
    final matches = _within(corpus, request.since, request.until)
      ..sort((a, b) {
        final byRank = supportsSort && request.newest
            ? 0
            : rank(b).compareTo(rank(a));
        return byRank != 0 ? byRank : newest(a, b);
      });
    return matches.take(math.min(request.limit, 500)).toList();
  }

  Future<SearchByDateResult> run(
    SearchSort order, {
    int? since,
    int? until,
    bool nativeNewest = false,
  }) => searchByDate(
    fetchPage: fetch,
    order: order,
    limit: 20,
    since: since,
    until: until,
    nativeNewest: nativeNewest,
  );
}

List<NostrEvent> _within(List<NostrEvent> corpus, int? since, int? until) =>
    corpus
        .where((e) => since == null || e.createdAt >= since)
        .where((e) => until == null || e.createdAt <= until)
        .toList();

List<String> _truth(
  List<NostrEvent> corpus,
  SearchSort order, {
  int? since,
  int? until,
  int limit = 20,
}) => (_within(
  corpus,
  since,
  until,
)..sort(compareByDate(order))).take(limit).map((e) => e.id).toList();

List<String> _ids(SearchByDateResult result) =>
    result.events.map((e) => e.id).toList();

const _orders = [SearchSort.newest, SearchSort.oldest];

void main() {
  test('the newest match ranks last, beyond the relevance page', () async {
    final corpus = [
      for (var i = 0; i < 900; i++) _event(i, 1000 + i),
      _event(9999, 9000000),
    ];
    final relay = _Relay(corpus, rank: (e) => e.id == '009999' ? 0 : 5);
    final page = await relay.fetch(const SearchPageRequest(limit: 200));
    expect(page.any((e) => e.id == '009999'), isFalse);

    final result = await relay.run(SearchSort.newest);
    expect(result.exact, isTrue);
    expect(_ids(result), _truth(corpus, SearchSort.newest));
    expect(_ids(result).first, '009999');
  });

  for (final MapEntry(key: name, value: rank)
      in <String, num Function(NostrEvent)>{
        'ties': (_) => 0,
        'old first': (e) => -e.createdAt,
        'new first': (e) => e.createdAt,
      }.entries) {
    for (final order in _orders) {
      test('exact ${order.name} across thousands of matches: $name', () async {
        final corpus = [
          for (var i = 0; i < 8000; i++) _event(i, 1700000000 + i * 600),
        ];
        final relay = _Relay(corpus, rank: rank);
        final result = await relay.run(order);
        expect(result.exact, isTrue);
        expect(result.hasMore, isTrue);
        expect(_ids(result), _truth(corpus, order));
        expect(relay.requests.length, lessThanOrEqualTo(16));
      });
    }
  }

  test('randomised corpora never claim a wrong exact order', () async {
    for (var seed = 0; seed < 80; seed++) {
      final random = math.Random(seed);
      final span = 1 + random.nextInt(5000);
      final corpus = [
        for (var i = 0; i < random.nextInt(1500); i++)
          _event(i, 10000 + random.nextInt(span)),
      ];
      final since = random.nextInt(3) == 0 ? 10000 + span ~/ 4 : null;
      final until = random.nextInt(3) == 0 ? 10000 + span ~/ 2 : null;
      for (final order in _orders) {
        final result = await _Relay(
          corpus,
          rank: (e) => int.parse(e.id) % 4,
        ).run(order, since: since, until: until);
        if (!result.exact) continue;
        final expected = _truth(
          corpus,
          order,
          since: since,
          until: until,
          limit: 21,
        );
        expect(_ids(result), expected.take(20), reason: 'seed $seed');
        expect(result.hasMore, expected.length > 20, reason: 'seed $seed');
      }
    }
  });

  for (final count in [19, 20, 21, 199, 200, 201, 500, 501]) {
    test('page boundary: $count matches', () async {
      final corpus = [for (var i = 0; i < count; i++) _event(i, 5000 + i)];
      for (final order in _orders) {
        final result = await _Relay(
          corpus,
          rank: (e) => -e.createdAt,
        ).run(order);
        expect(result.exact, isTrue);
        expect(_ids(result), _truth(corpus, order));
        expect(result.hasMore, count > 20);
      }
    });
  }

  test('one second holding more than a page is not called exact', () async {
    final corpus = [for (var i = 0; i < 900; i++) _event(i, 2000)];
    for (final order in _orders) {
      final result = await _Relay(corpus, rank: (_) => 0).run(order);
      expect(result.exact, isFalse);
      expect(result.events, hasLength(20));
    }
  });

  test('the caller date range is never widened', () async {
    final corpus = [for (var i = 0; i < 2000; i++) _event(i, 1000 + i)];
    for (final order in _orders) {
      final relay = _Relay(corpus, rank: (e) => -e.createdAt);
      await relay.run(order, since: 1200, until: 2400);
      for (final request in relay.requests) {
        expect(request.since, greaterThanOrEqualTo(1200));
        expect(request.until, lessThanOrEqualTo(2400));
      }
    }
  });

  test('relay-side newest is one request; ignored sorts are caught', () async {
    final corpus = [for (var i = 0; i < 900; i++) _event(i, 1000 + i)];
    final native = _Relay(
      corpus,
      rank: (e) => -e.createdAt,
      supportsSort: true,
    );
    final result = await native.run(SearchSort.newest, nativeNewest: true);
    expect(native.requests, hasLength(1));
    expect(native.requests.single.newest, isTrue);
    expect(_ids(result), _truth(corpus, SearchSort.newest));

    final ignoring = _Relay(corpus, rank: (e) => -e.createdAt);
    final fallback = await ignoring.run(SearchSort.newest, nativeNewest: true);
    expect(fallback.exact, isTrue);
    expect(_ids(fallback), _truth(corpus, SearchSort.newest));
  });

  test('relay sorting is used only when NIP-11 advertises it', () {
    expect(
      advertisesSearchSort({
        'supported_extensions': ['buzz-search-sort'],
      }),
      isTrue,
    );
    expect(advertisesSearchSort({'supported_extensions': []}), isFalse);
    expect(
      advertisesSearchSort({'supported_extensions': 'buzz-search-sort'}),
      isFalse,
    );
    expect(advertisesSearchSort(null), isFalse);
  });
}

import 'dart:math' as math;

import 'package:flutter/foundation.dart';

import '../../shared/relay/relay.dart';

/// Message-result ordering. Relevance is the relay's default.
enum SearchSort {
  relevance('Relevance'),
  newest('Newest'),
  oldest('Oldest');

  const SearchSort(this.label);

  final String label;

  /// Parses a stored value, falling back to [relevance].
  static SearchSort parse(String? value) =>
      values.firstWhere((sort) => sort.name == value, orElse: () => relevance);

  /// Section heading; never claims an order that was not proven.
  String heading({required bool exact}) => switch (this) {
    relevance => 'Messages · most relevant',
    newest =>
      exact
          ? 'Messages · newest first'
          : 'Messages · newest of the top matches',
    oldest =>
      exact
          ? 'Messages · oldest first'
          : 'Messages · oldest of the top matches',
  };
}

/// The relay clamps a search page to 500 (`PER_PAGE_MAX` in buzz-search).
const _relayPageMax = 500;
const _minSample = 200;

/// Bounds the work one search can cause on the relay.
const _maxRequests = 16;

@immutable
class SearchPageRequest {
  final int limit;
  final int? since;
  final int? until;

  /// Ask the relay to order by date (`buzz-search-sort`).
  final bool newest;

  const SearchPageRequest({
    required this.limit,
    this.since,
    this.until,
    this.newest = false,
  });
}

@immutable
class SearchByDateResult {
  final List<NostrEvent> events;

  /// True when [events] are provably the first matches in this order.
  final bool exact;
  final bool hasMore;

  const SearchByDateResult(
    this.events, {
    required this.exact,
    required this.hasMore,
  });
}

/// Deterministic order; ties match the relay's `created_at DESC, id`.
int Function(NostrEvent, NostrEvent) compareByDate(SearchSort order) => (a, b) {
  final byDate = order == SearchSort.newest
      ? b.createdAt.compareTo(a.createdAt)
      : a.createdAt.compareTo(b.createdAt);
  return byDate != 0 ? byDate : a.id.compareTo(b.id);
};

/// Finds the first [limit] matches by date. Port of desktop's
/// `searchByDate.ts`, which documents the proof: a relay page is the top
/// matches by *relevance*, so one page sorted by date is not "the newest".
/// Either the relay sorts ([nativeNewest]), or windows are narrowed until a
/// short page proves them complete. Otherwise `exact` is false.
Future<SearchByDateResult> searchByDate({
  required Future<List<NostrEvent>> Function(SearchPageRequest) fetchPage,
  required SearchSort order,
  required int limit,
  int? since,
  int? until,
  bool nativeNewest = false,
}) async {
  assert(order != SearchSort.relevance);
  final newest = order == SearchSort.newest;
  final compare = compareByDate(order);

  if (newest && nativeNewest) {
    // One extra row answers "is there more?".
    final events = await fetchPage(
      SearchPageRequest(
        limit: math.min(limit + 1, _relayPageMax),
        since: since,
        until: until,
        newest: true,
      ),
    );
    var descending = true;
    for (var i = 1; i < events.length; i++) {
      if (events[i].createdAt > events[i - 1].createdAt) descending = false;
    }
    // A relay that stopped honouring the sort falls through to narrowing.
    if (descending) {
      return SearchByDateResult(
        events.take(limit).toList(),
        exact: true,
        hasMore: events.length > limit,
      );
    }
  }

  final sampleSize = math.min(_relayPageMax, math.max(_minSample, limit * 5));
  final seen = <String, NostrEvent>{};
  List<NostrEvent> ordered() => seen.values.toList()..sort(compare);
  int midpoint(int near, int far) =>
      math.max(near + (far - near) ~/ 2, near + 1);

  // `t` runs away from the wanted end: smaller is earlier in the result.
  final sign = newest ? -1 : 1;
  int? toT(int? seconds) => seconds == null ? null : sign * seconds;
  final start = toT(newest ? until : since);
  final end = toT(newest ? since : until);

  // Every match with `t <= known` has been seen; null before any proof.
  int? known = start == null ? null : start - 1;
  // The wanted matches are proven to have `t <= bound`.
  int? bound = end;
  int? target = end;
  int? lastFull;
  var step = 0;

  for (var request = 0; request < _maxRequests; request++) {
    final first = known == null ? null : sign * (known + 1);
    final last = toT(target);
    final page = await fetchPage(
      SearchPageRequest(
        limit: sampleSize,
        since: newest ? last : first,
        until: newest ? first : last,
      ),
    );
    for (final event in page) {
      seen[event.id] = event;
    }
    final sorted = ordered();

    if (page.length < sampleSize) {
      if (target == end || target == bound) {
        return SearchByDateResult(
          sorted.take(limit).toList(),
          exact: true,
          hasMore: bound != end || sorted.length > limit,
        );
      }
      final reached = target!;
      known = reached;
      if (sorted.length >= limit &&
          sign * sorted[limit - 1].createdAt <= reached) {
        return SearchByDateResult(
          sorted.take(limit).toList(),
          exact: true,
          hasMore: true,
        );
      }
      final far = bound!;
      final tightened =
          lastFull == null || (far - reached) * 2 <= lastFull - reached;
      target = tightened ? far : midpoint(reached, far);
      continue;
    }

    final near = known ?? sign * sorted.first.createdAt;
    final far = target ?? sign * sorted.last.createdAt;
    final tight = math.min(sign * sorted[limit - 1].createdAt, far);
    bound = tight;
    lastFull = target;
    final int next;
    if (known == null) {
      // A sample says nothing about what lies beyond it, so reach past it,
      // further each time, until a window proves the near edge. No message
      // predates the epoch, and the relay rejects negative times.
      step = math.max(math.max(step * 4, far - near), 1);
      final reach = math.min(near - step, tight);
      next = newest ? reach : math.max(reach, 0);
    } else if ((tight - known) * 2 <= far - known) {
      next = tight;
    } else {
      next = midpoint(near, tight);
    }
    // No progress: one second holds more matches than a page can.
    if (target != null && next >= target) break;
    target = next;
  }

  return SearchByDateResult(
    ordered().take(limit).toList(),
    exact: false,
    hasMore: true,
  );
}

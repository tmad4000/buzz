import 'package:flutter/foundation.dart';
import 'feed_item.dart';

enum ThreadInboxPhase { idle, loading, ready, partial, unavailable }

/// Coverage is only for the loaded tracked-root window, never a global count.
@immutable
class ThreadInboxState {
  const ThreadInboxState({
    this.phase = ThreadInboxPhase.idle,
    this.items = const [],
    this.loadedRoots = 0,
    this.attemptedRoots = 0,
    this.hasMoreRoots = false,
    this.rootCapReached = false,
    this.historyLimited = false,
    this.unavailableRoots = false,
    this.liveUnavailable = false,
    this.busy = false,
  });
  final ThreadInboxPhase phase;
  final List<FeedItem> items;
  final int loadedRoots;
  final int attemptedRoots;
  final bool hasMoreRoots;
  final bool rootCapReached;
  final bool historyLimited;
  final bool unavailableRoots;
  final bool liveUnavailable;
  final bool busy;
  bool get hasInterest => phase != ThreadInboxPhase.idle;
  bool get loading => phase == ThreadInboxPhase.loading || busy;
  bool get canLoadMore => hasMoreRoots && !rootCapReached && !loading;

  ThreadInboxState copyWith({
    ThreadInboxPhase? phase,
    List<FeedItem>? items,
    int? loadedRoots,
    int? attemptedRoots,
    bool? hasMoreRoots,
    bool? rootCapReached,
    bool? historyLimited,
    bool? unavailableRoots,
    bool? liveUnavailable,
    bool? busy,
  }) => ThreadInboxState(
    phase: phase ?? this.phase,
    items: items ?? this.items,
    loadedRoots: loadedRoots ?? this.loadedRoots,
    attemptedRoots: attemptedRoots ?? this.attemptedRoots,
    hasMoreRoots: hasMoreRoots ?? this.hasMoreRoots,
    rootCapReached: rootCapReached ?? this.rootCapReached,
    historyLimited: historyLimited ?? this.historyLimited,
    unavailableRoots: unavailableRoots ?? this.unavailableRoots,
    liveUnavailable: liveUnavailable ?? this.liveUnavailable,
    busy: busy ?? this.busy,
  );
}

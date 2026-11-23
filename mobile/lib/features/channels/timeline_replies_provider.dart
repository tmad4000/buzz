import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/relay/relay.dart';
import 'thread_replies_provider.dart';

/// Concurrent thread reads, matching desktop's Timeline loader.
const _maxConcurrentReads = 2;

/// Replies loaded for a channel's flat Timeline.
@immutable
class TimelineReplies {
  /// Creates a loading snapshot.
  const TimelineReplies({
    this.byRoot = const {},
    this.failed = const {},
    this.loading = false,
  });

  /// Complete replies by root event ID.
  final Map<String, List<NostrEvent>> byRoot;

  /// Roots whose replies could not be read.
  final Set<String> failed;

  /// Whether any root is still queued or in flight.
  final bool loading;
}

/// Loads reply subtrees for the roots in a Timeline, a bounded number at a
/// time. Loading is presentation only and never advances read state.
class TimelineRepliesNotifier extends Notifier<TimelineReplies> {
  /// Creates a loader for [channelId].
  TimelineRepliesNotifier(this.channelId);

  /// Channel whose replies are loaded.
  final String channelId;
  final _queue = <String>[];
  final _requested = <String>{};
  var _active = 0;
  var _generation = 0;

  @override
  TimelineReplies build() {
    _queue.clear();
    _requested.clear();
    _active = 0;
    _generation++;
    ref.watch(relayConfigProvider);
    ref.onDispose(() => _generation++);
    // Replies missed while the socket was stale need a fresh read.
    ref.listen(relaySessionProvider, (previous, next) {
      if (previous?.status != SessionStatus.connected &&
          next.status == SessionStatus.connected) {
        final roots = {..._requested};
        _requested.clear();
        _queue.clear();
        _generation++;
        _active = 0;
        request(roots);
      }
    });
    return const TimelineReplies();
  }

  /// Load [rootIds] not already requested.
  void request(Iterable<String> rootIds) {
    final added = rootIds.where(_requested.add).toList();
    if (added.isEmpty) return;
    _queue.addAll(added);
    _publish();
    _pump();
  }

  /// Read every failed root again.
  void retry() {
    final failed = state.failed;
    _requested.removeAll(failed);
    state = TimelineReplies(byRoot: state.byRoot, loading: state.loading);
    request(failed);
  }

  void _publish({Map<String, List<NostrEvent>>? byRoot, Set<String>? failed}) {
    state = TimelineReplies(
      byRoot: byRoot ?? state.byRoot,
      failed: failed ?? state.failed,
      loading: _active > 0 || _queue.isNotEmpty,
    );
  }

  void _pump() {
    while (_active < _maxConcurrentReads && _queue.isNotEmpty) {
      _active++;
      unawaited(_load(_queue.removeAt(0), _generation));
    }
  }

  Future<void> _load(String rootId, int generation) async {
    bool isCurrent() => generation == _generation;
    List<NostrEvent>? replies;
    try {
      replies = await fetchCompleteThreadReplies(
        ref.read(relaySessionProvider.notifier),
        ThreadRepliesArgs(channelId: channelId, rootId: rootId),
        isCurrent: isCurrent,
      );
    } catch (error) {
      if (isCurrent()) debugPrint('timeline: failed to load replies: $error');
    }
    if (!isCurrent()) return;
    _active--;
    final loaded = replies;
    _publish(
      byRoot: loaded == null ? null : {...state.byRoot, rootId: loaded},
      failed: loaded == null
          ? {...state.failed, rootId}
          : ({...state.failed}..remove(rootId)),
    );
    _pump();
  }
}

/// Timeline reply loader per channel; released with the page.
final timelineRepliesProvider = NotifierProvider.autoDispose
    .family<TimelineRepliesNotifier, TimelineReplies, String>(
      TimelineRepliesNotifier.new,
    );

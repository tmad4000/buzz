import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/relay/relay.dart';
import '../channels/channel.dart';
import '../channels/channels_provider.dart';
import '../channels/thread_follows/thread_follows_provider.dart';
import 'feed_item.dart';
import 'thread_inbox_policy.dart';
import 'thread_inbox_state.dart';

String? _memberKey(AsyncValue<List<Channel>> value) {
  final channels = value.asData?.value;
  if (channels == null) return null;
  return jsonEncode([
    for (final id in {
      for (final channel in channels)
        if (channel.isMember) channel.id,
    }.toList()..sort())
      id,
  ]);
}

class _Input {
  _Input(this.config, this.pubkey, this.roots, this.memberKey)
    : members = Set.unmodifiable(
        memberKey == null
            ? <String>[]
            : (jsonDecode(memberKey) as List).cast<String>(),
      );
  final RelayConfig config;
  final String? pubkey;
  final List<String> roots;
  final String? memberKey;
  final Set<String> members;
  String get key =>
      '${config.baseUrl}\u0000$pubkey\u0000$memberKey\u0000${roots.join(',')}';
}

final _threadInboxInputProvider = Provider<_Input>((ref) {
  final config = ref.watch(relayConfigProvider);
  final pubkey = ref.watch(myPubkeyProvider)?.trim().toLowerCase();
  final interest = ref.watch(channelThreadInterestProvider);
  final followed = ref.watch(threadFollowsProvider);
  final members = ref.watch(channelsProvider.select(_memberKey));
  final roots = pubkey != null && interest.pubkey == pubkey
      ? inboxInterestRoots(
          followed: followed.followedRootIds,
          participated: interest.participated,
          authored: interest.authored,
        )
      : const <String>[];
  return _Input(config, pubkey, roots, members);
});

/// Bounded, in-memory source over the existing authenticated relay session.
/// No new persisted follow/task model and no claim of inbound BIP340 proof.
class ThreadInboxNotifier extends Notifier<ThreadInboxState> {
  int _generation = 0;
  int _window = threadInboxRootPageSize;
  _Input? _input;
  final _bindings = <String, ThreadRootBinding>{};
  final _events = <String, NostrEvent>{};
  final _subscriptions = <void Function()>[];
  final _liveUnavailable = <int>{};
  Future<void>? _inFlight;

  _Input _currentInput() => ref.read(_threadInboxInputProvider);

  @override
  ThreadInboxState build() {
    final input = ref.watch(_threadInboxInputProvider);
    final connected =
        ref.watch(relaySessionProvider.select((session) => session.status)) ==
        SessionStatus.connected;
    final sameContext =
        _input != null &&
        _input!.config == input.config &&
        _input!.key == input.key;
    _input = input;
    if (!sameContext) {
      _window = threadInboxRootPageSize;
      _bindings.clear();
      _events.clear();
    }
    final generation = ++_generation;
    _closeSubscriptions();
    _inFlight = null;
    ref.onDispose(() {
      _generation++;
      _closeSubscriptions();
    });
    if (input.pubkey == null || input.roots.isEmpty) {
      return const ThreadInboxState();
    }
    if (input.memberKey == null) {
      return const ThreadInboxState(
        phase: ThreadInboxPhase.unavailable,
        unavailableRoots: true,
      );
    }
    if (!connected) {
      return ThreadInboxState(
        phase: _events.isEmpty
            ? ThreadInboxPhase.unavailable
            : ThreadInboxPhase.partial,
        items: _items(),
        unavailableRoots: true,
        liveUnavailable: true,
      );
    }
    scheduleMicrotask(() {
      if (!_current(generation, input)) return;
      _inFlight = _load(generation, input);
    });
    return ThreadInboxState(phase: ThreadInboxPhase.loading, items: _items());
  }

  bool _current(int generation, _Input input) {
    if (!ref.mounted || generation != _generation) return false;
    final current = _currentInput();
    return current.config == input.config && current.key == input.key;
  }

  Future<void> refresh() {
    if (!ref.mounted) return Future.value();
    if (state.loading) return _inFlight ?? Future.value();
    final input = _input;
    if (input == null || input.pubkey == null || input.roots.isEmpty) {
      return Future.value();
    }
    // Invalidation may be scheduled but not built yet: never use its old scope.
    if (_currentInput().key != input.key ||
        _currentInput().config != input.config) {
      return Future.value();
    }
    if (input.memberKey == null) {
      state = state.copyWith(phase: ThreadInboxPhase.loading);
      return _inFlight = _refreshMembership(_generation, input);
    }
    if (ref.read(relaySessionProvider).status != SessionStatus.connected) {
      return Future.value();
    }
    final generation = ++_generation;
    _closeSubscriptions();
    state = state.copyWith(
      phase: ThreadInboxPhase.loading,
      liveUnavailable: false,
    );
    return _inFlight = _load(generation, input);
  }

  Future<void> loadMore() {
    if (!state.canLoadMore) return Future.value();
    _window = min(_window + threadInboxRootPageSize, threadInboxMaxRoots);
    return refresh();
  }

  Future<void> _refreshMembership(int generation, _Input input) async {
    try {
      await ref.read(channelsProvider.notifier).refresh();
    } catch (_) {
      // Membership failure is unavailable, never an empty successful source.
    } finally {
      if (_current(generation, input)) {
        state = state.copyWith(
          phase: ThreadInboxPhase.unavailable,
          unavailableRoots: true,
        );
        _inFlight = null;
      }
    }
  }

  Future<void> _load(int generation, _Input input) async {
    if (!_current(generation, input)) return;
    // Subscribe from before this read began, not from after potentially slow
    // root/history reads. Exact event-ID dedup absorbs the intentional overlap.
    final liveSince = DateTime.now().millisecondsSinceEpoch ~/ 1000 - 5;
    final session = ref.read(relaySessionProvider.notifier);
    final requested = input.roots
        .take(min(_window, threadInboxMaxRoots))
        .toList();
    var failed = false, saturated = false;
    try {
      final missing = requested
          .where((id) => !_bindings.containsKey(id))
          .toList();
      for (
        var start = 0;
        start < missing.length;
        start += threadInboxRootPageSize
      ) {
        if (!_current(generation, input)) return;
        final batch = missing
            .skip(start)
            .take(threadInboxRootPageSize)
            .toList();
        try {
          final rows = await session.fetchHistory(
            NostrFilter(
              kinds: threadInboxRootKinds,
              ids: batch,
              limit: batch.length,
            ),
          );
          if (!_current(generation, input)) return;
          _bindings.addAll(
            bindInboxRoots(
              rows.take(batch.length),
              batch.toSet(),
              input.members,
            ),
          );
        } catch (_) {
          if (!_current(generation, input)) return;
          failed = true;
        }
      }
      if (!_current(generation, input)) return;
      final active = {
        for (final id in requested)
          if (_bindings[id] != null) id: _bindings[id]!,
      };
      final batches = inboxReplyBatches(active);
      for (
        var start = 0;
        start < batches.length;
        start += threadInboxReadConcurrency
      ) {
        if (!_current(generation, input)) return;
        final group = batches
            .skip(start)
            .take(threadInboxReadConcurrency)
            .toList();
        final results = await Future.wait(
          group.map((batch) async {
            if (!_current(generation, input)) {
              return (batch: batch, rows: <NostrEvent>[], failed: false);
            }
            try {
              final rows = await session.fetchHistory(inboxReplyFilter(batch));
              return (batch: batch, rows: rows, failed: false);
            } catch (_) {
              return (batch: batch, rows: <NostrEvent>[], failed: true);
            }
          }),
        );
        if (!_current(generation, input)) return;
        for (final result in results) {
          failed = failed || result.failed;
          saturated = saturated || result.rows.length >= threadInboxReplyLimit;
          for (final event in result.rows.take(threadInboxReplyLimit)) {
            if (isInboxThreadReply(
              event,
              result.batch,
              input.pubkey!,
              input.members,
            )) {
              _events.putIfAbsent(event.id, () => event);
            }
          }
        }
      }
      if (!_current(generation, input)) return;
      // Cached rows belong to this exact interest/member scope and loaded roots.
      _events.removeWhere(
        (_, event) =>
            !isInboxThreadReply(event, active, input.pubkey!, input.members),
      );
      final evicted = _trimEvents();
      final unavailableRoots = active.length < requested.length;
      final more = input.roots.length > requested.length;
      final limited = saturated || evicted;
      final phase = (failed || unavailableRoots) && active.isEmpty
          ? ThreadInboxPhase.unavailable
          : failed || unavailableRoots || more || limited
          ? ThreadInboxPhase.partial
          : ThreadInboxPhase.ready;
      state = ThreadInboxState(
        phase: phase,
        items: _items(),
        loadedRoots: active.length,
        attemptedRoots: requested.length,
        hasMoreRoots: more,
        rootCapReached: more && requested.length >= threadInboxMaxRoots,
        historyLimited: limited,
        unavailableRoots: failed || unavailableRoots,
        busy: true,
      );
      await _subscribe(session, generation, input, batches, liveSince);
    } finally {
      if (_current(generation, input)) {
        _inFlight = null;
        state = state.copyWith(busy: false);
      }
    }
  }

  bool _trimEvents() {
    if (_events.length <= threadInboxMaxEvents) return false;
    final rows = _events.values.toList()
      ..sort((a, b) {
        final time = b.createdAt.compareTo(a.createdAt);
        return time != 0 ? time : a.id.compareTo(b.id);
      });
    _events
      ..clear()
      ..addEntries(
        rows
            .take(threadInboxMaxEvents)
            .map((event) => MapEntry(event.id, event)),
      );
    return true;
  }

  List<FeedItem> _items() => List.unmodifiable(
    _events.values.map(
      (event) => FeedItem(
        id: event.id,
        kind: event.kind,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.createdAt,
        channelId: singleInboxChannel(event),
        channelName: '',
        tags: event.tags,
        category: 'activity',
      ),
    ),
  );

  Future<void> _subscribe(
    RelaySessionNotifier session,
    int generation,
    _Input input,
    List<Map<String, ThreadRootBinding>> batches,
    int liveSince,
  ) async {
    if (ref.read(relaySessionProvider).status != SessionStatus.connected) {
      if (_current(generation, input)) {
        state = state.copyWith(
          phase: ThreadInboxPhase.partial,
          liveUnavailable: true,
        );
      }
      return;
    }
    _liveUnavailable.addAll(List.generate(batches.length, (index) => index));
    if (batches.isNotEmpty) {
      state = state.copyWith(
        phase: ThreadInboxPhase.partial,
        liveUnavailable: true,
      );
    }
    for (var index = 0; index < batches.length; index++) {
      if (!_current(generation, input)) return;
      final batch = batches[index];
      final batchIndex = index;
      void availability(bool available) {
        if (!_current(generation, input)) return;
        if (available) {
          _liveUnavailable.remove(batchIndex);
        } else {
          _liveUnavailable.add(batchIndex);
        }
        final liveUnavailable = _liveUnavailable.isNotEmpty;
        final partial =
            state.hasMoreRoots ||
            state.historyLimited ||
            state.unavailableRoots ||
            liveUnavailable;
        state = state.copyWith(
          phase: state.phase == ThreadInboxPhase.unavailable
              ? state.phase
              : partial
              ? ThreadInboxPhase.partial
              : ThreadInboxPhase.ready,
          liveUnavailable: liveUnavailable,
        );
      }

      try {
        final cleanup = await session.subscribeWithStatus(
          inboxReplyFilter(batch, since: liveSince),
          (event) {
            if (!_current(generation, input) ||
                !isInboxThreadReply(
                  event,
                  batch,
                  input.pubkey!,
                  input.members,
                )) {
              return;
            }
            if (_events.containsKey(event.id)) return;
            _events[event.id] = event;
            final limited = _trimEvents();
            state = state.copyWith(
              items: _items(),
              historyLimited: state.historyLimited || limited,
              phase: limited ? ThreadInboxPhase.partial : state.phase,
            );
          },
          onClosed: (_) => availability(false),
          onStatusChanged: (status) =>
              availability(status == RelaySubscriptionStatus.ready),
        );
        if (!_current(generation, input)) {
          cleanup();
          return;
        }
        _subscriptions.add(cleanup);
      } catch (_) {
        availability(false);
      }
    }
  }

  void _closeSubscriptions() {
    for (final cleanup in _subscriptions) {
      cleanup();
    }
    _subscriptions.clear();
    _liveUnavailable.clear();
  }
}

final threadInboxProvider =
    NotifierProvider<ThreadInboxNotifier, ThreadInboxState>(
      ThreadInboxNotifier.new,
    );

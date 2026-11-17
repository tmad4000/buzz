import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/relay/relay.dart';
import '../channels/channel.dart';
import '../channels/channel_management_provider.dart';
import '../channels/channels_provider.dart';

@immutable
class SearchHit {
  final String eventId;
  final String content;
  final int kind;
  final String pubkey;
  final String? channelId;
  final String? channelName;
  final int createdAt;
  final double score;
  final List<List<String>> tags;

  const SearchHit({
    required this.eventId,
    required this.content,
    required this.kind,
    required this.pubkey,
    this.channelId,
    this.channelName,
    required this.createdAt,
    required this.score,
    this.tags = const [],
  });

  factory SearchHit.fromJson(Map<String, dynamic> json) => SearchHit(
    eventId: json['event_id'] as String,
    content: json['content'] as String? ?? '',
    kind: json['kind'] as int? ?? 9,
    pubkey: json['pubkey'] as String,
    channelId: json['channel_id'] as String?,
    channelName: json['channel_name'] as String?,
    createdAt: json['created_at'] as int? ?? 0,
    score: (json['score'] as num?)?.toDouble() ?? 0.0,
    tags:
        (json['tags'] as List<dynamic>?)
            ?.map((t) => (t as List<dynamic>).map((e) => e as String).toList())
            .toList() ??
        const [],
  );
}

@immutable
class SearchState {
  final String query;
  final String? channelId;
  final List<SearchHit> messageResults;
  final List<DirectoryUser> userResults;
  final List<Channel> channelResults;
  final bool isLoading;
  final String? error;

  const SearchState({
    this.query = '',
    this.channelId,
    this.messageResults = const [],
    this.userResults = const [],
    this.channelResults = const [],
    this.isLoading = false,
    this.error,
  });

  const SearchState.initial({this.channelId})
    : query = '',
      messageResults = const [],
      userResults = const [],
      channelResults = const [],
      isLoading = false,
      error = null;

  SearchState copyWith({
    String? query,
    List<SearchHit>? messageResults,
    List<DirectoryUser>? userResults,
    List<Channel>? channelResults,
    bool? isLoading,
    String? error,
  }) => SearchState(
    query: query ?? this.query,
    channelId: channelId,
    messageResults: messageResults ?? this.messageResults,
    userResults: userResults ?? this.userResults,
    channelResults: channelResults ?? this.channelResults,
    isLoading: isLoading ?? this.isLoading,
    error: error ?? this.error,
  );
}

class SearchNotifier extends Notifier<SearchState> {
  SearchNotifier({this.initialChannelId});

  final String? initialChannelId;
  Timer? _debounce;
  int _generation = 0;
  bool _built = false;

  @override
  SearchState build() {
    // Watch relayConfig so search state resets on community switch.
    ref.watch(relayConfigProvider);
    _debounce?.cancel();
    _generation++;
    // A channel belongs to its opening community. Never carry that scope or
    // its query/results into a newly selected community.
    final channelId = _built ? null : initialChannelId;
    _built = true;
    ref.onDispose(() {
      _debounce?.cancel();
      _generation++;
    });
    return SearchState.initial(channelId: channelId);
  }

  void search(String query) {
    _debounce?.cancel();
    final generation = ++_generation;
    final channelId = state.channelId;

    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      state = SearchState.initial(channelId: channelId);
      return;
    }

    state = SearchState(query: trimmed, channelId: channelId, isLoading: true);

    _debounce = Timer(const Duration(milliseconds: 300), () {
      _executeSearch(trimmed, channelId, generation);
    });
  }

  bool _isCurrent(String query, String? channelId, int generation) =>
      ref.mounted &&
      _generation == generation &&
      state.query == query &&
      state.channelId == channelId;

  void _executeSearch(String query, String? channelId, int generation) {
    if (!_isCurrent(query, channelId, generation)) return;

    // Fire all three lookups in parallel.
    unawaited(_searchMessages(query, channelId, generation));
    if (channelId == null) {
      unawaited(_searchUsers(query, generation));
      _searchChannels(query, generation);
    }
  }

  Future<void> _searchMessages(
    String query,
    String? channelId,
    int generation,
  ) async {
    try {
      final session = ref.read(relaySessionProvider.notifier);
      final events = await session.fetchHistory(
        NostrFilter(
          kinds: const [9, 40002, 45001, 45003],
          search: query,
          tags: channelId == null
              ? const {}
              : {
                  '#h': [channelId],
                },
          limit: 20,
        ),
      );
      if (!_isCurrent(query, channelId, generation)) return;

      // Channel-name lookup from the cached channels list — not all hits
      // will have a known channel (e.g. ones we're not a member of).
      final channelsById = {
        for (final c in ref.read(channelsProvider).value ?? const <Channel>[])
          c.id: c.name,
      };

      final hits = events
          // The visible scope must remain true even if a relay returns an
          // unrelated hit. The request is still scoped at the relay as well.
          .where((event) => channelId == null || event.channelId == channelId)
          .map(
            (e) => SearchHit(
              eventId: e.id,
              content: e.content,
              kind: e.kind,
              pubkey: e.pubkey,
              channelId: e.channelId,
              channelName: e.channelId != null
                  ? channelsById[e.channelId!]
                  : null,
              createdAt: e.createdAt,
              score: 0.0,
              tags: e.tags,
            ),
          )
          .toList();

      if (!_isCurrent(query, channelId, generation)) return;
      state = state.copyWith(messageResults: hits, isLoading: false);
    } catch (e) {
      if (!_isCurrent(query, channelId, generation)) return;
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> _searchUsers(String query, int generation) async {
    try {
      final users = await ref
          .read(channelActionsProvider)
          .searchUsers(query, limit: 8);

      if (!_isCurrent(query, null, generation)) return;
      state = state.copyWith(userResults: users);
    } catch (_) {
      // User search failure is non-critical — keep existing results.
    }
  }

  void _searchChannels(String query, int generation) {
    final channels = ref.read(channelsProvider).value ?? [];
    final lowerQuery = query.toLowerCase();
    final matches = channels.where((c) {
      if (c.isDm) return false;
      return c.name.toLowerCase().contains(lowerQuery) ||
          c.description.toLowerCase().contains(lowerQuery);
    }).toList();

    if (!_isCurrent(query, null, generation)) return;
    state = state.copyWith(channelResults: matches);
  }

  void clear() {
    _debounce?.cancel();
    _generation++;
    state = SearchState.initial(channelId: state.channelId);
  }

  void setChannelScope(String? channelId) {
    if (state.channelId == channelId) return;
    final query = state.query;
    state = SearchState.initial(channelId: channelId);
    search(query);
  }
}

final searchProvider = NotifierProvider<SearchNotifier, SearchState>(
  SearchNotifier.new,
);

/// A channel search route must not change the global Search tab's query/scope.
/// Identity equality also separates two open search routes for the same channel.
class ChannelSearchScope {
  ChannelSearchScope(this.channelId);
  final String channelId;
}

final channelSearchProvider = NotifierProvider.autoDispose
    .family<SearchNotifier, SearchState, ChannelSearchScope>(
      (scope) => SearchNotifier(initialChannelId: scope.channelId),
    );

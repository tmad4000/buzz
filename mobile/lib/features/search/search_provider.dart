import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/relay/relay.dart';
import '../channels/channel.dart';
import '../channels/channel_management_provider.dart';
import '../channels/channels_provider.dart';
import '../../shared/theme/theme_provider.dart';
import 'search_by_date.dart';
import 'search_operators.dart';
import 'search_sort_support.dart';

export 'search_by_date.dart' show SearchSort;

const _searchSortPrefsKey = 'search_sort_v1';
const _messageLimit = 20;
const _messageLimitMax = 200;
const _messageKinds = [9, 40002, 45001, 45003];

/// The exact identity behind a picked `from:` / `in:` name. Names are not
/// unique, so a pick must keep meaning what was picked; editing the operator's
/// text drops back to resolving it by name.
@immutable
class PickedOperator {
  final String written;
  final String id;
  const PickedOperator({required this.written, required this.id});
}

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
  final List<SearchHit> messageResults;
  final List<DirectoryUser> userResults;
  final List<Channel> channelResults;
  final bool isLoading;
  final String? error;

  /// How [messageResults] are ordered.
  final SearchSort sort;

  /// False when a date sort covers only the relay's top matches.
  final bool sortIsExact;
  final bool hasMoreMessages;

  /// Why filters alone produced nothing, when that is the case.
  final String? notice;

  const SearchState({
    this.query = '',
    this.messageResults = const [],
    this.userResults = const [],
    this.channelResults = const [],
    this.isLoading = false,
    this.error,
    this.sort = SearchSort.relevance,
    this.sortIsExact = true,
    this.hasMoreMessages = false,
    this.notice,
  });

  const SearchState.initial({this.sort = SearchSort.relevance})
    : query = '',
      messageResults = const [],
      userResults = const [],
      channelResults = const [],
      isLoading = false,
      error = null,
      sortIsExact = true,
      hasMoreMessages = false,
      notice = null;

  SearchState copyWith({
    String? query,
    List<SearchHit>? messageResults,
    List<DirectoryUser>? userResults,
    List<Channel>? channelResults,
    bool? isLoading,
    String? error,
    bool? sortIsExact,
    bool? hasMoreMessages,
    String? notice,
    bool clearError = false,
  }) => SearchState(
    query: query ?? this.query,
    messageResults: messageResults ?? this.messageResults,
    userResults: userResults ?? this.userResults,
    channelResults: channelResults ?? this.channelResults,
    isLoading: isLoading ?? this.isLoading,
    error: clearError ? null : error ?? this.error,
    sort: sort,
    sortIsExact: sortIsExact ?? this.sortIsExact,
    hasMoreMessages: hasMoreMessages ?? this.hasMoreMessages,
    notice: notice ?? this.notice,
  );
}

/// Aborts paging for a search that is no longer shown.
class _Superseded implements Exception {
  const _Superseded();
}

class SearchNotifier extends Notifier<SearchState> {
  Timer? _debounce;

  /// Fences results: a sort or filter change keeps the same query text.
  int _generation = 0;
  int _limit = _messageLimit;
  PickedOperator? _pickedFrom;
  PickedOperator? _pickedIn;

  @override
  SearchState build() {
    // Watch relayConfig so search state resets on community switch.
    ref.watch(relayConfigProvider);
    _debounce?.cancel();
    _generation++;
    _pickedFrom = null;
    _pickedIn = null;
    ref.onDispose(() {
      _debounce?.cancel();
      _generation++;
    });
    return SearchState.initial(
      sort: SearchSort.parse(
        ref.read(savedPrefsProvider).getString(_searchSortPrefsKey),
      ),
    );
  }

  void search(String query) {
    _debounce?.cancel();
    final generation = ++_generation;
    _limit = _messageLimit;

    final trimmed = query.trim();
    if (trimmed.isEmpty) {
      state = SearchState.initial(sort: state.sort);
      return;
    }

    state = SearchState(query: trimmed, isLoading: true, sort: state.sort);

    _debounce = Timer(const Duration(milliseconds: 300), () {
      _executeSearch(trimmed, generation);
    });
  }

  /// Orders message results by [sort] and remembers it on this device.
  void setSort(SearchSort sort) {
    if (sort == state.sort) return;
    unawaited(
      ref.read(savedPrefsProvider).setString(_searchSortPrefsKey, sort.name),
    );
    _debounce?.cancel();
    final generation = ++_generation;
    _limit = _messageLimit;
    final query = state.query;
    state = SearchState(
      query: query,
      userResults: state.userResults,
      channelResults: state.channelResults,
      isLoading: query.isNotEmpty,
      sort: sort,
    );
    if (query.isNotEmpty) _executeSearch(query, generation);
  }

  /// Binds the next `from:` (or `in:`) operator to the exact picked identity.
  void pickFrom(PickedOperator? picked) => _pickedFrom = picked;
  void pickChannel(PickedOperator? picked) => _pickedIn = picked;

  /// Extends the current message results.
  void showMoreMessages() {
    if (!state.hasMoreMessages || state.isLoading) return;
    _limit = (_limit + _messageLimit).clamp(_messageLimit, _messageLimitMax);
    final generation = ++_generation;
    state = state.copyWith(isLoading: true, clearError: true);
    unawaited(_searchMessages(state.query, generation));
  }

  bool _isCurrent(String query, int generation) =>
      ref.mounted && _generation == generation && state.query == query;

  void _executeSearch(String query, int generation) {
    if (!_isCurrent(query, generation)) return;

    // Fire all three lookups in parallel.
    final text = SearchOperators.parse(query).text;
    unawaited(_searchMessages(query, generation));
    if (text.isEmpty) return;
    unawaited(_searchUsers(query, text, generation));
    _searchChannels(query, text, generation);
  }

  /// Resolves `from:` to a pubkey. Null means no one matched.
  Future<String?> _resolveAuthor(String raw) async {
    final picked = _pickedFrom;
    if (picked != null && picked.written == raw) return picked.id;
    if (RegExp(r'^[0-9a-fA-F]{64}$').hasMatch(raw)) return raw.toLowerCase();
    final handle = (raw.startsWith('@') ? raw.substring(1) : raw).toLowerCase();
    if (handle.isEmpty) return null;
    final users = await ref
        .read(channelActionsProvider)
        .searchUsers(handle, limit: 8);
    for (final user in users) {
      if (user.displayName?.trim().toLowerCase() == handle) {
        return user.pubkey.toLowerCase();
      }
    }
    return null;
  }

  /// Resolves `in:` to a channel id. Null means no channel matched.
  Future<String?> _resolveChannel(String raw) async {
    final picked = _pickedIn;
    if (picked != null && picked.written == raw) return picked.id;
    final value = (raw.startsWith('#') ? raw.substring(1) : raw).toLowerCase();
    for (final channel in await ref.read(channelsProvider.future)) {
      if (channel.id.toLowerCase() == value ||
          channel.name.toLowerCase() == value) {
        return channel.id;
      }
    }
    return null;
  }

  Future<void> _searchMessages(String query, int generation) async {
    try {
      final operators = SearchOperators.parse(query);
      if (operators.text.isEmpty) {
        state = state.copyWith(
          isLoading: false,
          notice: 'Add a word to search. Filters narrow matching messages.',
        );
        return;
      }

      // An unmatched filter must never silently widen the search.
      final channelId = operators.inChannel == null
          ? null
          : await _resolveChannel(operators.inChannel!);
      final author = operators.from == null
          ? null
          : await _resolveAuthor(operators.from!);
      if (!_isCurrent(query, generation)) return;
      if ((operators.inChannel != null && channelId == null) ||
          (operators.from != null && author == null)) {
        state = state.copyWith(
          messageResults: const [],
          isLoading: false,
          notice: 'No one or no channel matches that filter.',
        );
        return;
      }

      final sort = state.sort;
      final limit = _limit;
      final session = ref.read(relaySessionProvider.notifier);
      NostrFilter filter({
        required int limit,
        int? since,
        int? until,
        bool newest = false,
      }) => NostrFilter(
        kinds: _messageKinds,
        search: operators.text,
        authors: author == null ? null : [author],
        tags: channelId == null
            ? const {}
            : {
                '#h': [channelId],
              },
        since: since,
        until: until,
        limit: limit,
        extensions: newest ? const {'search_sort': 'newest'} : const {},
      );

      final SearchByDateResult result;
      if (sort == SearchSort.relevance) {
        final events = await session.fetchHistory(
          filter(limit: limit, since: operators.since, until: operators.until),
        );
        result = SearchByDateResult(
          events,
          exact: true,
          hasMore: events.length >= limit,
        );
      } else {
        result = await searchByDate(
          order: sort,
          limit: limit,
          since: operators.since,
          until: operators.until,
          nativeNewest: sort == SearchSort.newest && await _relaySorts(),
          // HTTP, not WebSocket: the sort extension is HTTP-only, and a failed
          // WebSocket search ends like a complete one.
          fetchPage: (page) {
            if (!_isCurrent(query, generation)) throw const _Superseded();
            return session.queryRelay([
              filter(
                limit: page.limit,
                since: page.since,
                until: page.until,
                newest: page.newest,
              ),
            ]);
          },
        );
      }
      if (!_isCurrent(query, generation)) return;

      // Channel-name lookup from the cached channels list — not all hits
      // will have a known channel (e.g. ones we're not a member of).
      final channelsById = {
        for (final c in ref.read(channelsProvider).value ?? const <Channel>[])
          c.id: c.name,
      };

      final hits = result.events
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

      state = state.copyWith(
        messageResults: hits,
        isLoading: false,
        sortIsExact: result.exact,
        hasMoreMessages: result.hasMore && limit < _messageLimitMax,
      );
    } on _Superseded {
      // A newer search owns the state.
    } catch (e) {
      if (!_isCurrent(query, generation)) return;
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// A failed probe only costs the faster route, so it reads as unsupported.
  Future<bool> _relaySorts() async {
    try {
      return await ref.read(relaySearchSortProvider.future);
    } catch (_) {
      if (ref.mounted) ref.invalidate(relaySearchSortProvider);
      return false;
    }
  }

  Future<void> _searchUsers(String query, String text, int generation) async {
    try {
      final users = await ref
          .read(channelActionsProvider)
          .searchUsers(text, limit: 8);

      if (!_isCurrent(query, generation)) return;
      state = state.copyWith(userResults: users);
    } catch (_) {
      // User search failure is non-critical — keep existing results.
    }
  }

  void _searchChannels(String query, String text, int generation) {
    final channels = ref.read(channelsProvider).value ?? [];
    final lowerQuery = text.toLowerCase();
    final matches = channels.where((c) {
      if (c.isDm) return false;
      return c.name.toLowerCase().contains(lowerQuery) ||
          c.description.toLowerCase().contains(lowerQuery);
    }).toList();

    if (!_isCurrent(query, generation)) return;
    state = state.copyWith(channelResults: matches);
  }

  void clear() {
    _debounce?.cancel();
    _generation++;
    _pickedFrom = null;
    _pickedIn = null;
    state = SearchState.initial(sort: state.sort);
  }
}

final searchProvider = NotifierProvider<SearchNotifier, SearchState>(
  SearchNotifier.new,
);

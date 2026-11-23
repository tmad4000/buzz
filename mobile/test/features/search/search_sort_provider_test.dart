import 'dart:async';

import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/channels/channel_management_provider.dart';
import 'package:buzz/features/channels/channels_provider.dart';
import 'package:buzz/features/search/search_provider.dart';
import 'package:buzz/features/search/search_sort_support.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:buzz/shared/theme/theme_provider.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Session extends RelaySessionNotifier {
  final socket = <NostrFilter>[];
  final http = <NostrFilter>[];
  Completer<List<NostrEvent>>? pending;
  Object? failure;

  @override
  SessionState build() => const SessionState(status: SessionStatus.connected);

  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    socket.add(filter);
    return pending?.future ?? [_event('relevant', 100)];
  }

  @override
  Future<List<NostrEvent>> queryRelay(
    List<NostrFilter> filters, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    http.add(filters.single);
    if (failure case final failure?) throw failure;
    return [_event('newer', 300), _event('older', 200)];
  }
}

class _Config extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://community.test');
}

class _Channels extends ChannelsNotifier {
  @override
  Future<List<Channel>> build() async => const [];
}

class _Actions extends Mock implements ChannelActions {}

NostrEvent _event(String id, int createdAt) => NostrEvent(
  id: id,
  pubkey: 'a' * 64,
  createdAt: createdAt,
  kind: 9,
  tags: const [],
  content: id,
  sig: '',
);

void main() {
  late SharedPreferences prefs;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  ProviderContainer container(_Session session, {bool relaySorts = false}) {
    final actions = _Actions();
    when(
      () => actions.searchUsers(any(), limit: any(named: 'limit')),
    ).thenAnswer((_) async => const []);
    final result = ProviderContainer(
      overrides: [
        savedPrefsProvider.overrideWithValue(prefs),
        relaySessionProvider.overrideWith(() => session),
        relayConfigProvider.overrideWith(_Config.new),
        channelsProvider.overrideWith(_Channels.new),
        channelActionsProvider.overrideWithValue(actions),
        relaySearchSortProvider.overrideWith((_) async => relaySorts),
      ],
    );
    result.listen(searchProvider, (_, _) {});
    return result;
  }

  void settle(FakeAsync clock) {
    clock.elapse(const Duration(milliseconds: 300));
    clock.flushMicrotasks();
  }

  test('relevance is the default; a chosen sort re-queries and persists', () {
    fakeAsync((clock) {
      final session = _Session();
      final c = container(session, relaySorts: true);
      final notifier = c.read(searchProvider.notifier);
      expect(c.read(searchProvider).sort, SearchSort.relevance);

      notifier.search('needle');
      settle(clock);
      expect(session.socket.single.extensions, isEmpty);
      expect(session.http, isEmpty);

      notifier.setSort(SearchSort.newest);
      clock.flushMicrotasks();
      expect(session.http.single.toJson()['search_sort'], 'newest');
      expect(c.read(searchProvider).messageResults.map((hit) => hit.eventId), [
        'newer',
        'older',
      ]);
      expect(c.read(searchProvider).sortIsExact, isTrue);

      c.dispose();
      final reopened = container(_Session());
      expect(reopened.read(searchProvider).sort, SearchSort.newest);
      reopened.dispose();
    });
  });

  test(
    'the sort field is never sent to a relay that does not advertise it',
    () {
      fakeAsync((clock) {
        final session = _Session();
        final c = container(session);
        c.read(searchProvider.notifier).setSort(SearchSort.newest);
        c.read(searchProvider.notifier).search('needle');
        settle(clock);
        expect(session.http, isNotEmpty);
        expect(session.http.every((f) => f.extensions.isEmpty), isTrue);
        c.dispose();
      });
    },
  );

  test('a slow relevance answer cannot overwrite a newer date sort', () {
    fakeAsync((clock) {
      final session = _Session()..pending = Completer();
      final c = container(session);
      final notifier = c.read(searchProvider.notifier)..search('needle');
      settle(clock);
      notifier.setSort(SearchSort.oldest);
      clock.flushMicrotasks();
      session.pending!.complete([_event('stale', 1)]);
      clock.flushMicrotasks();
      expect(c.read(searchProvider).messageResults.map((hit) => hit.eventId), [
        'older',
        'newer',
      ]);
      c.dispose();
    });
  });

  test('a failed date search is an error, not an empty result', () {
    fakeAsync((clock) {
      final session = _Session()..failure = StateError('down');
      final c = container(session);
      c.read(searchProvider.notifier).setSort(SearchSort.oldest);
      c.read(searchProvider.notifier).search('needle');
      settle(clock);
      expect(c.read(searchProvider).error, contains('down'));
      expect(c.read(searchProvider).isLoading, isFalse);
      c.dispose();
    });
  });

  test('operators narrow the relay filter and picks keep their identity', () {
    fakeAsync((clock) {
      final session = _Session();
      final c = container(session);
      final author = 'b' * 64;
      c.read(searchProvider.notifier)
        ..pickFrom(PickedOperator(written: '@Will Pfleger', id: author))
        ..search('needle from:"@Will Pfleger" after:2026-01-05');
      settle(clock);
      expect(session.socket.single.search, 'needle');
      expect(session.socket.single.authors, [author]);
      expect(session.socket.single.since, isNotNull);
      c.dispose();
    });
  });

  test('an unmatched filter never widens to an unfiltered search', () {
    fakeAsync((clock) {
      final session = _Session();
      final c = container(session);
      final notifier = c.read(searchProvider.notifier);
      for (final query in ['needle from:@nobody', 'needle in:#nowhere']) {
        notifier.search(query);
        settle(clock);
        expect(session.socket, isEmpty);
        expect(c.read(searchProvider).notice, contains('filter'));
      }
      notifier.search('in:#nowhere');
      settle(clock);
      expect(c.read(searchProvider).notice, contains('Add a word'));
      c.dispose();
    });
  });
}

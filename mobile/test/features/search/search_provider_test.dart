import 'dart:async';

import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/channels/channel_management_provider.dart';
import 'package:buzz/features/channels/channels_provider.dart';
import 'package:buzz/features/search/search_provider.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:mocktail/mocktail.dart';

class _Session extends RelaySessionNotifier {
  final filters = <NostrFilter>[];
  final requests = <Completer<List<NostrEvent>>>[];
  @override
  SessionState build() => const SessionState(status: SessionStatus.connected);
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) {
    filters.add(filter);
    final result = Completer<List<NostrEvent>>();
    requests.add(result);
    return result.future;
  }
}

class _Config extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://community-a.test');
}

class _Channels extends ChannelsNotifier {
  @override
  Future<List<Channel>> build() async => const [];
}

class _Actions extends Mock implements ChannelActions {}

NostrEvent _event(String id, String channel) => NostrEvent(
  id: id,
  pubkey: 'a' * 64,
  createdAt: 1700000000,
  kind: 9,
  tags: [
    ['h', channel],
  ],
  content: id,
  sig: 'synthetic',
);

class _Fixture {
  final scopeA = ChannelSearchScope('channel-a');
  final scopeB = ChannelSearchScope('channel-b');
  final session = _Session();
  final users = <Completer<List<DirectoryUser>>>[];
  final actions = _Actions();
  late final ProviderContainer container;
  _Fixture() {
    when(
      () => actions.searchUsers(any(), limit: any(named: 'limit')),
    ).thenAnswer((_) {
      final result = Completer<List<DirectoryUser>>();
      users.add(result);
      return result.future;
    });
    container = ProviderContainer(
      overrides: [
        relaySessionProvider.overrideWith(() => session),
        relayConfigProvider.overrideWith(_Config.new),
        channelsProvider.overrideWith(_Channels.new),
        channelActionsProvider.overrideWithValue(actions),
      ],
    );
    container.listen(searchProvider, (_, _) {});
    container.listen(channelSearchProvider(scopeA), (_, _) {});
    container.listen(channelSearchProvider(scopeB), (_, _) {});
    addTearDown(container.dispose);
  }
  SearchNotifier get global => container.read(searchProvider.notifier);
  SearchNotifier get scoped =>
      container.read(channelSearchProvider(scopeA).notifier);
  SearchState get state => container.read(channelSearchProvider(scopeA));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'channel query sends actual h filter, skips directory lookup and leaves global search independent',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.scoped.search('  legend  ');
        clock.elapse(const Duration(milliseconds: 300));
        clock.flushMicrotasks();
        expect(f.session.filters.single.toJson()['#h'], ['channel-a']);
        expect(f.session.filters.single.search, 'legend');
        expect(f.session.filters.single.kinds, [9, 40002, 45001, 45003]);
        expect(f.users, isEmpty);
        expect(f.container.read(searchProvider).query, isEmpty);
        f.scoped.setChannelScope(null);
        clock.elapse(const Duration(milliseconds: 300));
        clock.flushMicrotasks();
        expect(f.session.filters.last.tags, isEmpty);
        expect(f.users, hasLength(1));
        expect(f.state.query, 'legend');
        expect(f.state.channelId, isNull);
      });
    },
  );
  test(
    'separate search routes for one channel always open with their own channel scope',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.scoped.setChannelScope(null);
        final second = channelSearchProvider(ChannelSearchScope('channel-a'));
        f.container.listen(second, (_, _) {});
        expect(f.container.read(second).channelId, 'channel-a');
        expect(f.state.channelId, isNull);
      });
    },
  );
  test('scoped results discard an unrelated channel returned by a relay', () {
    fakeAsync((clock) {
      final f = _Fixture();
      clock.flushMicrotasks();
      f.scoped.search('scope');
      clock.elapse(const Duration(milliseconds: 300));
      f.session.requests.single.complete([
        _event('correct', 'channel-a'),
        _event('wrong', 'channel-b'),
      ]);
      clock.flushMicrotasks();
      expect(f.state.messageResults.map((hit) => hit.eventId), ['correct']);
    });
  });
  test('same-query scope change rejects late old-scope results and errors', () {
    fakeAsync((clock) {
      final f = _Fixture();
      clock.flushMicrotasks();
      f.scoped.search('same');
      clock.elapse(const Duration(milliseconds: 300));
      f.scoped.setChannelScope('channel-b');
      clock.elapse(const Duration(milliseconds: 300));
      f.session.requests[1].complete([_event('current-b', 'channel-b')]);
      clock.flushMicrotasks();
      f.session.requests[0].completeError(Exception('stale-a'));
      clock.flushMicrotasks();
      expect(f.state.messageResults.single.eventId, 'current-b');
      expect(f.state.error, isNull);
      expect(f.session.filters.last.toJson()['#h'], ['channel-b']);
    });
  });
  test(
    'ABA query race cannot overwrite a newer response with the same text',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        for (final query in ['a', 'b', 'a']) {
          f.scoped.search(query);
          clock.elapse(const Duration(milliseconds: 300));
        }
        f.session.requests[2].complete([_event('new-a', 'channel-a')]);
        clock.flushMicrotasks();
        f.session.requests[0].complete([_event('old-a', 'channel-a')]);
        f.session.requests[1].completeError(Exception('old-b'));
        clock.flushMicrotasks();
        expect(f.state.messageResults.single.eventId, 'new-a');
        expect(f.state.error, isNull);
      });
    },
  );
  test(
    'community switch resets channel, query and results and fences same-query old-community response',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.scoped.search('same');
        clock.elapse(const Duration(milliseconds: 300));
        f.container
            .read(relayConfigProvider.notifier)
            .update(baseUrl: 'https://community-b.test');
        clock.flushMicrotasks();
        expect(f.state.channelId, isNull);
        expect(f.state.query, isEmpty);
        expect(f.state.messageResults, isEmpty);
        f.scoped.search('same');
        clock.elapse(const Duration(milliseconds: 300));
        f.session.requests[1].complete([_event('community-b', 'channel-b')]);
        clock.flushMicrotasks();
        f.session.requests[0].complete([
          _event('private-community-a', 'channel-a'),
        ]);
        clock.flushMicrotasks();
        expect(f.state.messageResults.single.eventId, 'community-b');
      });
    },
  );
  test(
    'global user response cannot leak across community or later scope changes',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.global.search('alice');
        clock.elapse(const Duration(milliseconds: 300));
        f.container
            .read(relayConfigProvider.notifier)
            .update(baseUrl: 'https://community-b.test');
        clock.flushMicrotasks();
        f.global.search('alice');
        clock.elapse(const Duration(milliseconds: 300));
        f.users[0].complete([const DirectoryUser(pubkey: 'private-a')]);
        clock.flushMicrotasks();
        expect(f.container.read(searchProvider).userResults, isEmpty);
        f.users[1].complete([const DirectoryUser(pubkey: 'current-b')]);
        clock.flushMicrotasks();
        expect(
          f.container.read(searchProvider).userResults.single.pubkey,
          'current-b',
        );
        f.global.setChannelScope('channel-a');
        clock.elapse(const Duration(milliseconds: 300));
        expect(f.container.read(searchProvider).userResults, isEmpty);
      });
    },
  );
  test(
    'clear cancels debounce while retaining selected channel, and late results cannot repopulate it',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.scoped.search('not sent');
        f.scoped.clear();
        clock.elapse(const Duration(seconds: 1));
        expect(f.session.filters, isEmpty);
        expect(f.state.channelId, 'channel-a');
        f.scoped.search('sent');
        clock.elapse(const Duration(milliseconds: 300));
        f.scoped.clear();
        f.session.requests.single.complete([_event('late', 'channel-a')]);
        clock.flushMicrotasks();
        expect(f.state.query, isEmpty);
        expect(f.state.messageResults, isEmpty);
        expect(f.state.channelId, 'channel-a');
      });
    },
  );
  test(
    'disposal cancels debounce and late network completion without reading disposed Ref',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.scoped.search('sent');
        clock.elapse(const Duration(milliseconds: 300));
        f.global.search('pending');
        f.container.dispose();
        clock.elapse(const Duration(seconds: 1));
        f.session.requests.single.completeError(
          Exception('late disposal failure'),
        );
        clock.flushMicrotasks();
        expect(f.session.filters, hasLength(1));
      });
    },
  );
  test(
    'late directory success preserves message failure and bounded retry retains successful directory results',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.global.search('same');
        clock.elapse(const Duration(milliseconds: 300));
        f.session.requests[0].completeError(
          StateError('synthetic relay failure'),
        );
        clock.flushMicrotasks();
        final error = f.container.read(searchProvider).error;
        expect(error, isNotNull);
        f.users[0].complete([const DirectoryUser(pubkey: 'available')]);
        clock.flushMicrotasks();
        expect(f.container.read(searchProvider).error, error);
        f.global.retryMessages();
        f.global.retryMessages();
        expect(f.session.filters, hasLength(2));
        expect(f.users, hasLength(1));
        expect(
          f.container.read(searchProvider).userResults.single.pubkey,
          'available',
        );
        expect(f.container.read(searchProvider).error, error);
        f.session.requests[1].complete([]);
        clock.flushMicrotasks();
        expect(f.container.read(searchProvider).error, isNull);
        expect(
          f.container.read(searchProvider).userResults.single.pubkey,
          'available',
        );
      });
    },
  );
  test(
    'retry retains exact h scope and stale retry completion cannot overwrite a new scope',
    () {
      fakeAsync((clock) {
        final f = _Fixture();
        clock.flushMicrotasks();
        f.scoped.retryMessages();
        expect(f.session.filters, isEmpty);
        f.scoped.search('same');
        clock.elapse(const Duration(milliseconds: 300));
        f.session.requests[0].completeError(StateError('synthetic failure'));
        clock.flushMicrotasks();
        f.scoped.retryMessages();
        f.scoped.retryMessages();
        expect(f.session.filters, hasLength(2));
        expect(f.session.filters[1].toJson()['#h'], ['channel-a']);
        f.scoped.setChannelScope('channel-b');
        clock.elapse(const Duration(milliseconds: 300));
        f.session.requests[1].complete([_event('stale-retry-a', 'channel-a')]);
        clock.flushMicrotasks();
        expect(f.state.messageResults, isEmpty);
        expect(f.state.channelId, 'channel-b');
        f.session.requests[2].complete([_event('new-b', 'channel-b')]);
        clock.flushMicrotasks();
        expect(f.state.messageResults.single.eventId, 'new-b');
        expect(f.state.error, isNull);
      });
    },
  );
}

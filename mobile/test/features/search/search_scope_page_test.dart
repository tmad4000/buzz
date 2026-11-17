import 'dart:async';
import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/channels/channel_detail_page.dart';
import 'package:buzz/features/channels/channel_management_provider.dart';
import 'package:buzz/features/channels/channels_provider.dart';
import 'package:buzz/features/profile/profile_provider.dart';
import 'package:buzz/features/forum/forum_thread_page.dart';
import 'package:buzz/features/search/recent_searches_provider.dart';
import 'package:buzz/features/search/search_page.dart';
import 'package:buzz/shared/profile/user_cache_provider.dart';
import 'package:buzz/shared/profile/user_profile.dart';
import 'package:buzz/shared/mentions/agent_identity_provider.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:buzz/shared/theme/theme.dart';
import 'package:buzz/shared/widgets/frosted_app_bar.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:mocktail/mocktail.dart';

final _channel = Channel(
  id: 'channel-a',
  name: 'design',
  channelType: 'stream',
  visibility: 'open',
  description: '',
  createdBy: 'me',
  createdAt: DateTime(2025),
  memberCount: 2,
  isMember: true,
);

class _Config extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://community-a.test');
}

class _Profile extends ProfileNotifier {
  @override
  Future<UserProfile?> build() async =>
      const UserProfile(pubkey: 'me', displayName: 'Me');
}

class _Channels extends ChannelsNotifier {
  _Channels([this.channel]);
  final Channel? channel;
  @override
  Future<List<Channel>> build() async => [channel ?? _channel];
}

class _Recent extends RecentSearchesNotifier {
  @override
  List<String> build() => [];
  @override
  void record(String query) => state = [query];
}

class _Users extends UserCacheNotifier {
  @override
  Map<String, UserProfile> build() => {
    'alice': const UserProfile(pubkey: 'alice', displayName: 'Alice'),
  };
}

class _Actions extends Mock implements ChannelActions {}

class _Observer extends NavigatorObserver {
  final routes = <Route<dynamic>>[];
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    routes.add(route);
    super.didPush(route, previousRoute);
  }
}

class _Session extends RelaySessionNotifier {
  final filters = <NostrFilter>[];
  List<NostrEvent> hits = [];
  int failures = 0;
  Completer<List<NostrEvent>>? pending;
  @override
  SessionState build() => const SessionState(status: SessionStatus.connected);
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    filters.add(filter);
    if (filter.search == null) return [];
    if (failures > 0) {
      failures--;
      throw StateError('synthetic relay failure detail');
    }
    return pending == null ? hits : pending!.future;
  }
}

void main() {
  Future<void> mount(
    WidgetTester tester,
    _Session session, {
    _Observer? observer,
    Widget page = const SearchPage(
      channelId: 'channel-a',
      channelName: '#design',
      showBackButton: true,
    ),
    double scale = 1,
    Channel? channel,
    List<DirectoryUser> directoryUsers = const [],
  }) async {
    final actions = _Actions();
    when(
      () => actions.searchUsers(any(), limit: any(named: 'limit')),
    ).thenAnswer((_) async => directoryUsers);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          relayConfigProvider.overrideWith(_Config.new),
          relaySessionProvider.overrideWith(() => session),
          profileProvider.overrideWith(_Profile.new),
          channelsProvider.overrideWith(() => _Channels(channel)),
          recentSearchesProvider.overrideWith(_Recent.new),
          userCacheProvider.overrideWith(_Users.new),
          channelActionsProvider.overrideWithValue(actions),
          knownAgentPubkeysProvider.overrideWith((ref) => {}),
          agentMentionPubkeysProvider('channel-a').overrideWith((ref) => {}),
          agentDirectoryProvider.overrideWith((ref) async => []),
          agentOwnersProvider.overrideWith((ref) async => {}),
          channelMembersProvider('channel-a').overrideWith((ref) async => []),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          navigatorObservers: [?observer],
          home: MediaQuery(
            data: MediaQueryData(textScaler: TextScaler.linear(scale)),
            child: page,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'nested searches of one channel isolate state and restore the hidden global query on back',
    (tester) async {
      final session = _Session();
      await mount(tester, session);
      await tester.enterText(find.byType(TextField), 'legend');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.tap(find.byKey(const Key('search-all-channels')));
      await tester.pumpAndSettle();
      final context = tester.element(find.byType(SearchPage));
      Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => const SearchPage(
            channelId: 'channel-a',
            channelName: '#design',
            showBackButton: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('#design'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      Navigator.of(tester.element(find.byType(SearchPage).last)).pop();
      await tester.pumpAndSettle();
      expect(find.text('All channels'), findsOneWidget);
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'legend',
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets(
    'scope chip and All channels actually change relay filter without losing query',
    (tester) async {
      final session = _Session();
      await mount(tester, session);
      expect(find.byKey(const Key('search-scope-chip')), findsOneWidget);
      expect(find.text('#design'), findsOneWidget);
      expect(
        tester
            .widget<FrostedAppBar>(find.byType(FrostedAppBar))
            .automaticallyImplyLeading,
        isTrue,
      );
      await tester.enterText(find.byType(TextField), 'legend');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pump();
      expect(
        session.filters.where((f) => f.search == 'legend').last.toJson()['#h'],
        ['channel-a'],
      );
      await tester.tap(find.byKey(const Key('search-all-channels')));
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pump();
      expect(
        session.filters.where((f) => f.search == 'legend').last.tags,
        isEmpty,
      );
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        'legend',
      );
      expect(find.text('All channels'), findsOneWidget);
      expect(find.text('#design'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'community change clears field and channel scope; scope controls support large text',
    (tester) async {
      final session = _Session();
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await mount(tester, session, scale: 2);
      await tester.enterText(find.byType(TextField), 'private query');
      await tester.pump(const Duration(milliseconds: 301));
      final container = ProviderScope.containerOf(
        tester.element(find.byType(SearchPage)),
      );
      container
          .read(relayConfigProvider.notifier)
          .update(baseUrl: 'https://community-b.test');
      await tester.pumpAndSettle();
      expect(
        tester.widget<TextField>(find.byType(TextField)).controller!.text,
        isEmpty,
      );
      expect(find.text('#design'), findsNothing);
      expect(find.text('All channels'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'search reply uses canonical root and exact message when opening conversation',
    (tester) async {
      final session = _Session(), observer = _Observer();
      session.hits = [
        NostrEvent(
          id: 'reply',
          pubkey: 'alice',
          createdAt: 1700000000,
          kind: 9,
          sig: 'synthetic',
          tags: const [
            ['h', 'channel-a'],
            ['e', 'root', '', 'root'],
            ['e', 'parent', '', 'reply'],
          ],
          content: 'Specific search reply',
        ),
      ];
      await mount(tester, session, observer: observer);
      await tester.enterText(find.byType(TextField), 'specific');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      final context = tester.element(find.byType(SearchPage));
      await tester.tap(find.text('Specific search reply'));
      // Inspect the route produced by the real tap before mounting the unrelated
      // channel transport. Native channel/thread behavior has its own test suite.
      final route = observer.routes.last as MaterialPageRoute<void>;
      final target = route.builder(context) as ChannelDetailPage;
      expect(target.channel.id, 'channel-a');
      expect(target.initialMessageId, 'reply');
      expect(target.initialThreadRootId, 'root');
      expect(
        target.initialThreadRouteBehavior,
        InitialThreadRouteBehavior.replaceCurrentRoute,
      );
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'forum comment opens its canonical parent post without claiming exact comment focus',
    (tester) async {
      final forum = Channel(
        id: 'channel-a',
        name: 'design',
        channelType: 'forum',
        visibility: 'open',
        description: '',
        createdBy: 'me',
        createdAt: DateTime(2025),
        memberCount: 2,
        isMember: true,
      );
      final session = _Session(), observer = _Observer();
      session.hits = [
        NostrEvent(
          id: 'comment',
          pubkey: 'alice',
          createdAt: 1700000000,
          kind: 45003,
          sig: 'synthetic',
          tags: const [
            ['h', 'channel-a'],
            ['e', 'post-root', '', 'root'],
            ['e', 'parent-comment', '', 'reply'],
          ],
          content: 'Specific forum comment',
        ),
      ];
      await mount(tester, session, observer: observer, channel: forum);
      await tester.enterText(find.byType(TextField), 'specific');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      final context = tester.element(find.byType(SearchPage));
      await tester.tap(find.text('Specific forum comment'));
      final route = observer.routes.last as MaterialPageRoute<void>;
      final target = route.builder(context) as ForumThreadPage;
      expect(target.channelId, 'channel-a');
      expect(target.postEventId, 'post-root');
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'forum comment without a thread reference fails visibly and never opens an unrelated post',
    (tester) async {
      final session = _Session(), observer = _Observer();
      session.hits = [
        NostrEvent(
          id: 'comment',
          pubkey: 'alice',
          createdAt: 1700000000,
          kind: 45003,
          sig: 'synthetic',
          tags: const [
            ['h', 'channel-a'],
          ],
          content: 'Unlinked forum comment',
        ),
      ];
      await mount(tester, session, observer: observer);
      await tester.enterText(find.byType(TextField), 'unlinked');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      final routeCount = observer.routes.length;
      await tester.tap(find.text('Unlinked forum comment'));
      await tester.pump();
      expect(find.text('Thread could not be opened'), findsOneWidget);
      expect(observer.routes.length, routeCount);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'scoped relay failure is unavailable not empty, retries once with same h scope and can recover to true empty',
    (tester) async {
      final session = _Session()..failures = 1;
      await mount(tester, session);
      await tester.enterText(find.byType(TextField), 'unavailable');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('search-message-error')), findsOneWidget);
      expect(find.byKey(const Key('search-no-results-state')), findsNothing);
      expect(
        find.textContaining('synthetic relay failure detail'),
        findsNothing,
      );
      await tester.pump(const Duration(seconds: 5));
      expect(
        session.filters.where((filter) => filter.search != null),
        hasLength(1),
      );
      session.pending = Completer<List<NostrEvent>>();
      await tester.tap(find.byKey(const Key('search-retry-messages')));
      await tester.tap(find.byKey(const Key('search-retry-messages')));
      await tester.pump();
      expect(
        session.filters.where((filter) => filter.search != null),
        hasLength(2),
      );
      expect(session.filters.last.toJson()['#h'], ['channel-a']);
      expect(session.filters.last.search, 'unavailable');
      expect(
        tester
            .widget<TextButton>(find.byKey(const Key('search-retry-messages')))
            .onPressed,
        isNull,
      );
      session.pending!.complete([]);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('search-message-error')), findsNothing);
      expect(find.byKey(const Key('search-no-results-state')), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'global message retry preserves successful people and channels and hides transport detail',
    (tester) async {
      final session = _Session()..failures = 1;
      await mount(
        tester,
        session,
        page: const SearchPage(),
        directoryUsers: const [
          DirectoryUser(pubkey: 'available', displayName: 'Available person'),
        ],
      );
      await tester.enterText(find.byType(TextField), 'design');
      await tester.pump(const Duration(milliseconds: 301));
      await tester.pumpAndSettle();
      expect(find.text('Available person'), findsOneWidget);
      expect(find.text('design'), findsOneWidget);
      expect(find.byKey(const Key('search-message-error')), findsOneWidget);
      expect(find.byKey(const Key('search-no-results-state')), findsNothing);
      session.pending = Completer<List<NostrEvent>>();
      await tester.tap(find.byKey(const Key('search-retry-messages')));
      await tester.pump();
      expect(find.text('Available person'), findsOneWidget);
      expect(find.text('design'), findsOneWidget);
      expect(session.filters.last.tags, isEmpty);
      session.pending!.complete([]);
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('search-message-error')), findsNothing);
      expect(find.text('Available person'), findsOneWidget);
      expect(find.text('design'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
}

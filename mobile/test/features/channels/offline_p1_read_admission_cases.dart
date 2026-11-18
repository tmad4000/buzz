part of 'channel_detail_page_test.dart';

void _offlineP1ReadAdmissionTests() {
  testWidgets('P1 cached channel bodies never advance read markers on open', (
    tester,
  ) async {
    final readState = _SynchronousReadStateNotifier(
      const ReadStateState(
        isReady: true,
        pubkey: 'self',
        contexts: {},
        version: 0,
      ),
    );
    await tester.pumpWidget(
      _buildTestable(
        messages: [
          _textMsg(
            id: 'cached-body',
            pubkey: 'alice',
            content: 'Cached body',
            createdAt: 1000,
          ),
        ],
        readStateNotifier: readState,
        denyCachedReading: true,
      ),
    );
    await tester.pumpAndSettle();
    expect(readState.markedContexts, isEmpty);
    expect(findRichText('Cached body'), findsOneWidget);
  });
  testWidgets(
    'P1 actual encrypted disk thread hydration preserves truncation through banner Retry and reconnect',
    (tester) async {
      late Directory root;
      late _HydrationStore store;
      late ProviderContainer container;
      final session = _HydrationSession();
      const args = ThreadRepliesArgs(
        channelId: _channelId,
        rootId: 'disk-root',
      );
      const sourceId = 'thread:$_channelId:disk-root';
      final rootEvent = _textMsg(
        id: 'disk-root',
        pubkey: 'alice',
        content: 'Disk thread root',
        createdAt: 1000,
      );
      final cached = [
        for (var i = 1; i <= 200; i++)
          NostrEvent(
            id: 'cached-$i',
            pubkey: 'bob',
            createdAt: 1000 + i,
            kind: 9,
            tags: [
              ['h', _channelId],
              ['e', 'disk-root', '', 'reply'],
            ],
            content: 'Cached reply $i',
            sig: '',
          ),
      ];
      final readState = _SynchronousReadStateNotifier(
        const ReadStateState(
          isReady: true,
          pubkey: 'self',
          contexts: {},
          version: 0,
        ),
      );
      await tester.runAsync(() async {
        root = await Directory.systemTemp.createTemp(
          'buzz-thread-hydration-widget-',
        );
        final cipher = Nip44OfflineCipher(
          Uint8List.fromList(List.filled(32, 6)),
        );
        final writer = OfflineCacheStore(
          root: root,
          scope: 'disk-scope',
          cipher: cipher,
        );
        await writer.save('thread', '$_channelId:disk-root', {
          'events': cached.map((event) => event.toJson()).toList(),
          'truncated': true,
        });
        OfflineCacheStore.debugDropMetadataCache(root, 'disk-scope');
        store = _HydrationStore(root, cipher);
        final scope =
            _buildTestable(
                  messages: [rootEvent],
                  offlineCacheEnabled: true,
                  offlineStore: store,
                  relaySessionNotifier: session,
                  relayConfigNotifier: _HydrationConfig(),
                  readStateNotifier: readState,
                  users: const {
                    'alice': UserProfile(pubkey: 'alice', displayName: 'Alice'),
                    'bob': UserProfile(pubkey: 'bob', displayName: 'Bob'),
                  },
                  home: ThreadDetailPage(
                    threadHead: formatTimeline([rootEvent]).single,
                    allMessages: formatTimeline([rootEvent]),
                    channelId: _channelId,
                    currentPubkey: 'self',
                    isMember: true,
                    isArchived: false,
                  ),
                )
                as ProviderScope;
        container = ProviderContainer(overrides: scope.overrides);
        container.listen(
          threadRepliesProvider(args),
          (_, _) {},
          fireImmediately: true,
        );
        expect(
          (await container.read(threadRepliesProvider(args).future)).length,
          200,
        );
        await tester.pumpWidget(
          UncontrolledProviderScope(container: container, child: scope.child),
        );
      });
      addTearDown(() async {
        container.dispose();
        await root.delete(recursive: true);
      });
      await tester.pumpAndSettle();
      expect(session.queries, 0);
      expect(container.read(offlineSourceProvider(sourceId)).truncated, isTrue);
      expect(container.read(readAdmissionProvider(sourceId)), isFalse);
      expect(
        find.textContaining('Showing newest 200 cached replies'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Offline · showing cached as of'),
        findsOneWidget,
      );
      expect(readState.markedContexts, isEmpty);
      final initialLoads = store.loads;
      await tester.runAsync(() async {
        await tester.tap(find.text('Retry'));
        await container.read(threadRepliesProvider(args).future);
      });
      await tester.pumpAndSettle();
      expect(store.loads, greaterThan(initialLoads));
      expect(
        container.read(threadRepliesProvider(args)).requireValue.last.id,
        'cached-200',
      );
      expect(
        find.textContaining('Showing newest 200 cached replies'),
        findsOneWidget,
      );
      session.connect();
      await tester.pump();
      expect(find.text('Back online · refreshing…'), findsOneWidget);
      expect(container.read(readAdmissionProvider(sourceId)), isFalse);
      expect(session.queries, greaterThan(0));
      session.live.complete([
        const NostrEvent(
          id: 'fresh',
          pubkey: 'bob',
          createdAt: 1300,
          kind: 9,
          tags: [
            ['h', _channelId],
            ['e', 'disk-root', '', 'reply'],
          ],
          content: 'Fresh live reply',
          sig: '',
        ),
      ]);
      await tester.runAsync(() async {
        await container.read(threadRepliesProvider(args).future);
        for (var i = 0; i < 100; i++) {
          final snapshot = await store.load('thread', '$_channelId:disk-root');
          if (snapshot != null &&
              (snapshot.payload as Map)['truncated'] == false)
            break;
          await Future<void>.delayed(const Duration(milliseconds: 10));
        }
      });
      await tester.pumpAndSettle();
      expect(
        container.read(threadRepliesProvider(args)).requireValue.single.id,
        'fresh',
      );
      expect(
        container.read(offlineSourceProvider(sourceId)).truncated,
        isFalse,
      );
      expect(container.read(readAdmissionProvider(sourceId)), isTrue);
      expect(
        find.textContaining('Showing newest 200 cached replies'),
        findsNothing,
      );
      expect(find.text('Back online · refreshing…'), findsNothing);
      expect(find.text('Up to date'), findsOneWidget);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(seconds: 5));
    },
  );

  testWidgets(
    'P1 OFF covered channel readiness retains baseline read and observed-unread update',
    (tester) async {
      final readState = _CoveredReadState();
      final channels = _CoveredReadChannels();
      await tester.pumpWidget(
        _buildTestable(
          messages: [
            _textMsg(
              id: 'body',
              pubkey: 'alice',
              content: 'Covered body',
              createdAt: 1000,
            ),
          ],
          readStateNotifier: readState,
          channelsNotifier: channels,
          offlineCacheEnabled: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(readState.markedContexts, isEmpty);
      final context = tester.element(find.byType(ChannelDetailPage));
      final navigator = Navigator.of(context);
      unawaited(
        navigator.push(
          PageRouteBuilder<void>(
            opaque: false,
            pageBuilder: (_, _, _) => const Scaffold(body: Text('Cover')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(ModalRoute.of(context)?.isCurrent, isFalse);
      readState.becomeReady();
      await tester.pumpAndSettle();
      expect(readState.markedContexts[_channelId], 1000);
      expect(channels.covered, contains((_channelId, 1000)));
      navigator.pop();
      await tester.pumpAndSettle();
    },
  );
}

class _CoveredReadState extends _SynchronousReadStateNotifier {
  _CoveredReadState()
    : super(
        const ReadStateState(
          isReady: false,
          pubkey: 'self',
          contexts: {},
          version: 0,
        ),
      );
  void becomeReady() => state = const ReadStateState(
    isReady: true,
    pubkey: 'self',
    contexts: {},
    version: 0,
  );
}

class _CoveredReadChannels extends _FakeChannelsNotifier {
  _CoveredReadChannels() : super([_testChannel]);
  final covered = <(String, int)>[];
  @override
  void clearObservedUnreadCoveredByRead(String channelId, int readAt) {
    covered.add((channelId, readAt));
  }
}

class _HydrationConfig extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://relay.test');
}

class _HydrationSession extends RelaySessionNotifier {
  final live = Completer<List<NostrEvent>>();
  int queries = 0;
  @override
  SessionState build() =>
      const SessionState(status: SessionStatus.disconnected);
  void connect() => state = const SessionState(status: SessionStatus.connected);
  @override
  Future<List<NostrEvent>> queryRelay(
    List<NostrFilter> filters, {
    Duration timeout = const Duration(seconds: 8),
  }) {
    queries++;
    return live.future;
  }

  @override
  Future<void Function()> subscribe(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String)? onClosed,
    void Function(RelaySubscriptionStatus)? onStatusChanged,
    Duration timeout = const Duration(seconds: 8),
  }) async => () {};
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async => [];
}

class _HydrationStore extends OfflineCacheStore {
  int loads = 0;
  _HydrationStore(Directory root, OfflinePayloadCipher cipher)
    : super(root: root, scope: 'disk-scope', cipher: cipher);
  @override
  Future<OfflineSnapshot?> load(String kind, String id) {
    loads++;
    return super.load(kind, id);
  }
}

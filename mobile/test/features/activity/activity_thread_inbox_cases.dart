part of 'activity_page_test.dart';

typedef _InboxBuilder =
    Future<Widget> Function({
      HomeFeedResponse? feed,
      ActivityNotifier Function()? activityNotifier,
      TextScaler? textScaler,
      List<Override> overrides,
      List<NavigatorObserver> observers,
    });

class _CoverageSource extends ThreadInboxNotifier {
  _CoverageSource(this.initial);
  final ThreadInboxState initial;
  int retries = 0, pages = 0;
  @override
  ThreadInboxState build() => initial;
  @override
  Future<void> refresh() async {
    retries++;
  }

  @override
  Future<void> loadMore() async {
    pages++;
  }
}

class _InboxRouteObserver extends NavigatorObserver {
  final routes = <Route<dynamic>>[];
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    routes.add(route);
  }
}

class _RecoverableMainFeed extends ActivityNotifier {
  int retries = 0;
  final recovery = Completer<HomeFeedResponse>();
  @override
  Future<HomeFeedResponse> build() async =>
      throw StateError('synthetic private transport failure');
  @override
  Future<void> refresh() async {
    retries++;
    state = AsyncData(await recovery.future);
  }
}

void _threadInboxWidgetCases(_InboxBuilder buildTestable) {
  final tracked = FeedItem(
    id: 'tracked',
    kind: 9,
    pubkey: 'bob_pk',
    content: 'Available thread reply',
    createdAt: DateTime.now().millisecondsSinceEpoch ~/ 1000,
    channelId: 'ch1',
    channelName: 'general',
    category: 'activity',
    tags: const [
      ['e', 'tracked-root', '', 'reply'],
    ],
  );
  testWidgets(
    'main feed failure stays visible alongside ready tracked rows with independent bounded retry',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final main = _RecoverableMainFeed();
      final threads = _CoverageSource(
        ThreadInboxState(phase: ThreadInboxPhase.ready, items: [tracked]),
      );
      await tester.pumpWidget(
        await buildTestable(
          activityNotifier: () => main,
          textScaler: const TextScaler.linear(2),
          overrides: [threadInboxProvider.overrideWith(() => threads)],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Available thread reply'), findsOneWidget);
      expect(find.text('Some Inbox items couldn’t be loaded.'), findsOneWidget);
      expect(find.textContaining('synthetic private'), findsNothing);
      final retry = find.byKey(const Key('main-inbox-retry'));
      await tester.tap(retry);
      await tester.tap(retry);
      await tester.pump();
      expect(main.retries, 1);
      expect(tester.widget<TextButton>(retry).onPressed, isNull);
      expect(find.text('Loading Inbox items…'), findsOneWidget);
      expect(find.text('Available thread reply'), findsOneWidget);
      expect(threads.retries, 0);
      // The coverage widget moves between sliver and empty-filter layouts.
      // Retry ownership belongs to the page and must survive that move.
      await tester.tap(find.byKey(const ValueKey('activity-filter-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mentions'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextButton>(retry).onPressed, isNull);
      expect(main.retries, 1);
      await tester.tap(find.byKey(const ValueKey('activity-filter-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('All'));
      await tester.pumpAndSettle();
      expect(tester.widget<TextButton>(retry).onPressed, isNull);
      main.recovery.complete(
        HomeFeedResponse(
          mentions: [],
          needsAction: [],
          activity: [],
          agentActivity: [],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('main-inbox-coverage')), findsNothing);
      expect(find.text('Available thread reply'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'main loading preserves tracked rows and error cannot claim an empty filtered source',
    (tester) async {
      final threads = _CoverageSource(
        ThreadInboxState(phase: ThreadInboxPhase.ready, items: [tracked]),
      );
      await tester.pumpWidget(
        await buildTestable(
          activityNotifier: _PendingActivityNotifier.new,
          overrides: [threadInboxProvider.overrideWith(() => threads)],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Loading Inbox items…'), findsOneWidget);
      expect(find.text('Available thread reply'), findsOneWidget);
      expect(find.byKey(const Key('main-inbox-retry')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        await buildTestable(
          activityNotifier: _ErrorActivityNotifier.new,
          overrides: [
            threadInboxProvider.overrideWith(
              () => _CoverageSource(
                ThreadInboxState(
                  phase: ThreadInboxPhase.ready,
                  items: [tracked],
                ),
              ),
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('activity-filter-menu')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mentions'));
      await tester.pumpAndSettle();
      expect(find.text('Some Inbox items couldn’t be loaded.'), findsOneWidget);
      expect(find.text('No other Inbox items loaded.'), findsOneWidget);
      expect(find.text('No mentions yet'), findsNothing);
    },
  );
  testWidgets(
    'tracked-source failure keeps base Inbox usable with honest retry at narrow 2x scale',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final source = _CoverageSource(
        const ThreadInboxState(
          phase: ThreadInboxPhase.unavailable,
          unavailableRoots: true,
        ),
      );
      await tester.pumpWidget(
        await buildTestable(
          textScaler: const TextScaler.linear(2),
          overrides: [threadInboxProvider.overrideWith(() => source)],
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Tracked thread replies are unavailable.'),
        findsOneWidget,
      );
      expect(find.text('Hey check this out'), findsOneWidget);
      expect(find.text('Inbox is empty'), findsNothing);
      await tester.tap(find.byKey(const Key('thread-inbox-retry')));
      await tester.pump();
      expect(source.retries, 1);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'unavailable tracked replies never render authoritative empty; partial coverage offers bounded load more',
    (tester) async {
      final empty = HomeFeedResponse(
        mentions: [],
        needsAction: [],
        activity: [],
        agentActivity: [],
      );
      await tester.pumpWidget(
        await buildTestable(
          feed: empty,
          overrides: [
            threadInboxProvider.overrideWith(
              () => _CoverageSource(
                const ThreadInboxState(
                  phase: ThreadInboxPhase.unavailable,
                  unavailableRoots: true,
                ),
              ),
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No other Inbox items loaded.'), findsOneWidget);
      expect(find.text('Inbox is empty'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      final partial = _CoverageSource(
        const ThreadInboxState(
          phase: ThreadInboxPhase.partial,
          hasMoreRoots: true,
          historyLimited: true,
        ),
      );
      await tester.pumpWidget(
        await buildTestable(
          feed: empty,
          overrides: [threadInboxProvider.overrideWith(() => partial)],
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Some tracked thread replies aren’t loaded.'),
        findsOneWidget,
      );
      expect(find.text('Open a thread for earlier replies.'), findsOneWidget);
      await tester.tap(find.byKey(const Key('thread-inbox-load-more')));
      await tester.pump();
      expect(partial.pages, 1);
      expect(find.byKey(const Key('thread-inbox-retry')), findsNothing);
    },
  );
  testWidgets(
    'loading source preserves base rows; hard limit has no load-more action',
    (tester) async {
      await tester.pumpWidget(
        await buildTestable(
          overrides: [
            threadInboxProvider.overrideWith(
              () => _CoverageSource(
                const ThreadInboxState(phase: ThreadInboxPhase.loading),
              ),
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Loading tracked thread replies…'), findsOneWidget);
      expect(find.text('Hey check this out'), findsOneWidget);
      expect(find.byKey(const Key('thread-inbox-load-more')), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        await buildTestable(
          overrides: [
            threadInboxProvider.overrideWith(
              () => _CoverageSource(
                const ThreadInboxState(
                  phase: ThreadInboxPhase.partial,
                  hasMoreRoots: true,
                  rootCapReached: true,
                ),
              ),
            ),
          ],
        ),
      );
      await tester.pumpAndSettle();
      expect(find.textContaining('tracked-thread limit'), findsOneWidget);
      expect(find.byKey(const Key('thread-inbox-load-more')), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'forum Inbox comment opens canonical parent; missing root fails visibly',
    (tester) async {
      FeedItem comment(List<List<String>> tags) => FeedItem(
        id: 'comment',
        kind: 45003,
        pubkey: 'bob_pk',
        content: 'Forum reply',
        createdAt: DateTime.now().millisecondsSinceEpoch ~/ 1000,
        channelId: 'ch1',
        channelName: 'general',
        tags: tags,
        category: 'activity',
      );
      HomeFeedResponse feed(FeedItem item) => HomeFeedResponse(
        mentions: [],
        needsAction: [],
        activity: [item],
        agentActivity: [],
      );
      final observer = _InboxRouteObserver();
      await tester.pumpWidget(
        await buildTestable(
          observers: [observer],
          feed: feed(
            comment(const [
              ['e', 'post-root', '', 'root'],
              ['e', 'prior-comment', '', 'reply'],
            ]),
          ),
        ),
      );
      await tester.pumpAndSettle();
      final context = tester.element(find.byType(ActivityPage));
      await tester.tap(find.byKey(const ValueKey('inbox-row-comment')));
      // Inspect the actual navigation target before mounting unrelated forum
      // transport/polling; its native behavior has separate tests.
      final route = observer.routes.last as MaterialPageRoute<void>;
      final page = route.builder(context) as ForumThreadPage;
      expect(page.postEventId, 'post-root');
      expect(page.channelId, 'ch1');
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        await buildTestable(feed: feed(comment(const []))),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('inbox-row-comment')));
      await tester.pumpAndSettle();
      expect(find.text('Thread could not be opened'), findsOneWidget);
      expect(find.byType(ForumThreadPage), findsNothing);
    },
  );
}

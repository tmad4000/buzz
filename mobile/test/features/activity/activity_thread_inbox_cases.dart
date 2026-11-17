part of 'activity_page_test.dart';

typedef _InboxBuilder =
    Future<Widget> Function({
      HomeFeedResponse? feed,
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

void _threadInboxWidgetCases(_InboxBuilder buildTestable) {
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

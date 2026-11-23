part of '../channel_detail_page_test.dart';

class _RecordingSendMessage implements SendMessage {
  final sends = <({String content, String? parent, String? root})>[];
  Object? failure;

  @override
  Future<void> call({
    required String channelId,
    required String content,
    String? parentEventId,
    String? rootEventId,
    List<String>? mentionPubkeys,
    Channel? channel,
    List<List<String>> mediaTags = const [],
  }) async {
    sends.add((content: content, parent: parentEventId, root: rootEventId));
    if (failure case final error?) throw error;
  }
}

/// Serves thread queries to the bounded Timeline loader.
class _TimelineRelaySession extends RelaySessionNotifier {
  _TimelineRelaySession(this.load);

  final Future<List<NostrEvent>> Function(String rootId) load;
  final requested = <String>[];
  var active = 0;
  var maxActive = 0;

  @override
  SessionState build() => const SessionState(status: SessionStatus.connected);

  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async => const [];

  @override
  Future<void Function()> subscribe(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String message)? onClosed,
  }) async => () {};

  @override
  void Function() registerVisibleChannel(String channelId) => () {};

  @override
  Future<List<NostrEvent>> queryRelay(
    List<NostrFilter> filters, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    final root = filters.first.tags['#e']?.first;
    if (root == null) return const [];
    requested.add(root);
    maxActive = ++active > maxActive ? active : maxActive;
    try {
      return await load(root);
    } finally {
      active--;
    }
  }
}

NostrEvent _replyTo(
  String id,
  String content, {
  required String parent,
  String root = 'root',
  String pubkey = 'bob',
  required int createdAt,
}) => _textMsg(
  id: id,
  pubkey: pubkey,
  content: content,
  createdAt: createdAt,
  extraTags: [
    if (parent != root) ['e', root, '', 'root'],
    ['e', parent, '', 'reply'],
  ],
);

final _replyViewEvents = [
  _textMsg(
    id: 'root',
    pubkey: 'alice',
    content: 'Should we ship the beta on Thursday?',
    createdAt: 1000,
  ),
  _replyTo(
    'reply',
    'Yes, if the import fix lands',
    parent: 'root',
    createdAt: 1100,
  ),
  _textMsg(
    id: 'other',
    pubkey: 'bob',
    content: 'Lunch is at noon',
    createdAt: 1200,
  ),
  _replyTo(
    'nested',
    'It landed this morning',
    parent: 'reply',
    pubkey: 'alice',
    createdAt: 1300,
  ),
];

const _replyViewUsers = {
  'alice': UserProfile(pubkey: 'alice', displayName: 'Alice'),
  'bob': UserProfile(pubkey: 'bob', displayName: 'Bob'),
};

Future<void> _prepareReplyViewShot(WidgetTester tester) async {
  tester.view
    ..physicalSize = const Size(1170, 2532)
    ..devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  if (Platform.environment['BUZZ_REPLY_VIEW_SHOTS'] == null) return;
  for (final (family, asset) in const [
    ('Inter', 'assets/fonts/InterVariable.ttf'),
    ('BuzzTabler', 'assets/fonts/TablerIcons.ttf'),
  ]) {
    await (FontLoader(family)..addFont(rootBundle.load(asset))).load();
  }
}

/// Writes a real-font render only when a screenshot directory is requested.
Future<void> _captureReplyView(WidgetTester tester, String name) async {
  final directory = Platform.environment['BUZZ_REPLY_VIEW_SHOTS'];
  if (directory == null) return;
  final layer = tester.binding.renderViews.first.debugLayer! as OffsetLayer;
  await tester.runAsync(() async {
    final image = await layer.toImage(Offset.zero & const Size(1170, 2532));
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(directory).create(recursive: true);
    await File('$directory/$name.png').writeAsBytes(data!.buffer.asUint8List());
    image.dispose();
  });
}

void replyViewTests() {
  group('reply view', () {
    Widget channelApp(
      SendMessage sender, {
      RelaySessionNotifier? session,
      ReadStateNotifier? readState,
    }) => _buildTestable(
      messages: _replyViewEvents,
      users: _replyViewUsers,
      readStateNotifier: readState,
      relaySessionNotifier:
          session ?? _TimelineRelaySession((_) async => const []),
      home: ProviderScope(
        overrides: [sendMessageProvider.overrideWithValue(sender)],
        child: ChannelDetailPage(channel: _testChannel),
      ),
    );

    ProviderContainer container(WidgetTester tester) =>
        ProviderScope.containerOf(tester.element(find.byType(ComposeBar)));

    Future<void> chooseTimeline(WidgetTester tester) async {
      container(
        tester,
      ).read(channelTimelineOrderProvider(_channelId).notifier).set(true);
      await tester.pumpAndSettle();
    }

    Future<void> send(WidgetTester tester, String text) async {
      if (find.byType(TextField).evaluate().isEmpty) {
        await tester.tap(find.byType(ComposeBar));
        await tester.pumpAndSettle();
      }
      await tester.enterText(find.byType(TextField), text);
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(BuzzIcons.arrowUp));
      await tester.pumpAndSettle();
    }

    testWidgets('default Threads order has no quotes or swipe', (tester) async {
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      expect(find.byType(ReplyQuote), findsNothing);
      expect(find.byType(SwipeToReply), findsNothing);
      expect(findRichText('It landed this morning'), findsNothing);
    });

    testWidgets('Order is chosen in channel details and remembered', (
      tester,
    ) async {
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('channel-header-settings-trigger')),
      );
      await tester.pumpAndSettle();
      final order = find.byKey(const ValueKey('channel-details-order'));
      await tester.ensureVisible(order);
      await tester.pumpAndSettle();
      await tester.tap(order);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Timeline'));
      await tester.pumpAndSettle();
      expect(
        find.descendant(of: order, matching: find.text('Timeline')),
        findsOneWidget,
      );
      expect(
        _testPrefs.getKeys().where((key) => key.contains('channel-timeline')),
        hasLength(1),
      );
    });

    testWidgets('Timeline is flat and chronological with quoted parents', (
      tester,
    ) async {
      await _prepareReplyViewShot(tester);
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      double top(String id) =>
          tester.getTopLeft(find.byKey(ValueKey('timeline-row-$id'))).dy;
      expect(top('root'), lessThan(top('reply')));
      expect(top('reply'), lessThan(top('other')));
      expect(top('other'), lessThan(top('nested')));
      expect(find.byType(ReplyQuote), findsNWidgets(2));
      expect(
        find.descendant(
          of: find.byKey(const ValueKey('timeline-quote-nested')),
          matching: find.text('Yes, if the import fix lands'),
        ),
        findsOneWidget,
      );
      await _captureReplyView(tester, 'mobile-timeline');
      await tester.drag(
        find.byKey(const ValueKey('timeline-row-nested')),
        const Offset(-120, 0),
      );
      await tester.pumpAndSettle();
      expect(find.byType(ReplyTargetBar), findsOneWidget);
      await _captureReplyView(tester, 'mobile-timeline-reply');
    });

    testWidgets('swipe replies in place with exact parent and root', (
      tester,
    ) async {
      final sender = _RecordingSendMessage();
      await tester.pumpWidget(channelApp(sender));
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      final row = find.byKey(const ValueKey('timeline-row-nested'));
      await tester.drag(row, const Offset(-30, 0));
      await tester.pumpAndSettle();
      expect(find.byType(ReplyTargetBar), findsNothing);
      await tester.drag(row, const Offset(-120, 0));
      await tester.pumpAndSettle();
      expect(find.byType(ThreadDetailPage), findsNothing);
      await send(tester, 'Great');
      expect(sender.sends, [
        (content: 'Great', parent: 'nested', root: 'root'),
      ]);
      expect(find.byType(ReplyTargetBar), findsNothing);
      await send(tester, 'New topic');
      expect(sender.sends.last, (
        content: 'New topic',
        parent: null,
        root: null,
      ));
    });

    testWidgets('cancel keeps the draft, and a target survives remounting', (
      tester,
    ) async {
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      await tester.drag(
        find.byKey(const ValueKey('timeline-row-other')),
        const Offset(-120, 0),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'Draft text');
      await tester.pumpAndSettle();
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      expect(find.byType(ReplyTargetBar), findsOneWidget);
      await tester.tap(find.byTooltip('Cancel reply'));
      await tester.pumpAndSettle();
      expect(find.byType(ReplyTargetBar), findsNothing);
      expect(
        container(tester).read(composeDraftsProvider).single.text,
        'Draft text',
      );
    });

    testWidgets('a failed send keeps the reply target', (tester) async {
      final sender = _RecordingSendMessage()..failure = StateError('offline');
      await tester.pumpWidget(channelApp(sender));
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      await tester.drag(
        find.byKey(const ValueKey('timeline-row-other')),
        const Offset(-120, 0),
      );
      await tester.pumpAndSettle();
      await send(tester, 'Will fail');
      expect(sender.sends, hasLength(1));
      expect(find.byType(ReplyTargetBar), findsOneWidget);
    });

    testWidgets('tapping a quote highlights the original in place', (
      tester,
    ) async {
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      await tester.tap(find.byKey(const ValueKey('timeline-quote-nested')));
      await tester.pump(const Duration(milliseconds: 400));
      Color? color() =>
          (tester
                      .widget<DecoratedBox>(
                        find.byKey(const ValueKey('timeline-row-reply')),
                      )
                      .decoration
                  as BoxDecoration)
              .color;
      expect(color()!.a, greaterThan(0));
      expect(find.byType(ThreadDetailPage), findsNothing);
      await tester.pump(const Duration(seconds: 3));
      expect(color()!.a, 0);
    });

    testWidgets('older replies load with bounded reads and retry', (
      tester,
    ) async {
      var fail = true;
      final gates = <String, Completer<List<NostrEvent>>>{};
      final session = _TimelineRelaySession((root) {
        if (root == 'r0' && fail) {
          return Future.error(StateError('unavailable'));
        }
        if (root == 'r0') {
          return Future.value([
            _replyTo(
              'late',
              'Older reply',
              parent: 'r0',
              root: 'r0',
              createdAt: 5,
            ),
          ]);
        }
        return (gates[root] ??= Completer()).future;
      });
      await tester.pumpWidget(
        channelApp(_RecordingSendMessage(), session: session),
      );
      await tester.pumpAndSettle();
      final loader = container(
        tester,
      ).listen(timelineRepliesProvider(_channelId), (_, _) {});
      addTearDown(loader.close);
      final notifier = container(
        tester,
      ).read(timelineRepliesProvider(_channelId).notifier);
      notifier.request(['r0', 'r1', 'r2', 'r3']);
      await tester.pump();
      await tester.pump();
      expect(session.maxActive, 2);
      for (var i = 0; i < 4; i++) {
        for (final gate in gates.values.toList()) {
          if (!gate.isCompleted) gate.complete(const []);
        }
        await tester.pump();
        await tester.pump();
      }
      expect(session.maxActive, 2);
      expect(loader.read().loading, isFalse);
      expect(loader.read().failed, {'r0'});
      fail = false;
      notifier.retry();
      await tester.pump();
      await tester.pump();
      expect(loader.read().failed, isEmpty);
      expect(loader.read().byRoot['r0']!.single.id, 'late');
    });

    Widget threadApp(SendMessage sender, {ReadStateNotifier? readState}) {
      final messages = formatTimeline(_replyViewEvents);
      return _buildTestable(
        messages: _replyViewEvents,
        users: _replyViewUsers,
        readStateNotifier: readState,
        threadReplies: {
          'root': [_replyViewEvents[1], _replyViewEvents[3]],
        },
        home: ProviderScope(
          overrides: [sendMessageProvider.overrideWithValue(sender)],
          child: ThreadDetailPage(
            threadHead: messages.first,
            allMessages: messages,
            channelId: _channelId,
            currentPubkey: 'self',
            isMember: true,
            isArchived: false,
          ),
        ),
      );
    }

    testWidgets('one thread toggles flat and replies to the chosen message', (
      tester,
    ) async {
      await _prepareReplyViewShot(tester);
      final sender = _RecordingSendMessage();
      await tester.pumpWidget(threadApp(sender));
      await tester.pumpAndSettle();
      final nested = find.byKey(const ValueKey('thread-message-nested'));
      expect(nested, findsNothing);
      await _captureReplyView(tester, 'mobile-thread-nested');
      await tester.tap(find.byKey(const ValueKey('thread-flat-toggle')));
      await tester.pumpAndSettle();
      expect(nested, findsOneWidget);
      expect(find.byKey(const ValueKey('thread-quote-nested')), findsOneWidget);
      await _captureReplyView(tester, 'mobile-thread-flat');
      await tester.drag(nested, const Offset(-120, 0));
      await tester.pumpAndSettle();
      await send(tester, 'Flat reply');
      expect(sender.sends.single, (
        content: 'Flat reply',
        parent: 'nested',
        root: 'root',
      ));
      await tester.pumpWidget(const SizedBox());
      await tester.pumpWidget(threadApp(sender));
      await tester.pumpAndSettle();
      expect(nested, findsOneWidget, reason: 'the choice is remembered');
    });

    testWidgets('flat views never mark nested replies read', (tester) async {
      final readState = _SynchronousReadStateNotifier(
        const ReadStateState(
          contexts: {},
          version: 1,
          pubkey: 'self',
          isReady: true,
        ),
      );
      await tester.pumpWidget(
        threadApp(_RecordingSendMessage(), readState: readState),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('thread-flat-toggle')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('thread-message-nested')),
        findsOneWidget,
      );
      expect(readState.markedContexts.keys, isNot(contains('msg:nested')));
      expect(
        readState.markedContexts.keys,
        contains('msg:reply'),
        reason: 'existing direct-reply behavior is unchanged',
      );

      await tester.pumpWidget(const SizedBox());
      final channelRead = _SynchronousReadStateNotifier(
        const ReadStateState(
          contexts: {},
          version: 1,
          pubkey: 'self',
          isReady: true,
        ),
      );
      await tester.pumpWidget(
        channelApp(_RecordingSendMessage(), readState: channelRead),
      );
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      expect(
        channelRead.markedContexts.keys.where((key) => key.startsWith('msg:')),
        isEmpty,
      );
      expect(
        channelRead.markedContexts[_channelId],
        1200,
        reason: 'a visible reply must not advance the channel marker',
      );
    });

    testWidgets('a pending reply appears in Timeline before acknowledgement', (
      tester,
    ) async {
      await tester.pumpWidget(channelApp(_RecordingSendMessage()));
      await tester.pumpAndSettle();
      await chooseTimeline(tester);
      container(tester)
          .read(pendingLocalMessagesProvider(_channelId).notifier)
          .add(
            _replyTo(
              'mine',
              'Just sent',
              parent: 'other',
              root: 'other',
              createdAt: 1400,
            ),
          );
      await tester.pumpAndSettle();
      expect(findRichText('Just sent'), findsOneWidget);
    });
  });
}

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

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
}

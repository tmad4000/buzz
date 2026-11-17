part of 'channels_provider_test.dart';

void _threadInterestCases() {
  test(
    'self-only catch-up publishes immutable interest without channel repaint',
    () async {
      final session = _FakeRelaySession(
        memberships: [_membership(_channelA, 'me')],
        metadata: [_meta(id: _channelA, name: 'joined-a')],
      );
      final container = _buildContainer(session: session);
      addTearDown(container.dispose);
      await container.read(channelsProvider.future);
      await _settle();
      final initial = container.read(channelThreadInterestProvider);
      expect(initial.authored, isEmpty);
      final root = '1'.padLeft(64, '0');
      session.recentMessages = [
        NostrEvent(
          id: root,
          pubkey: 'me',
          kind: 9,
          createdAt: 100,
          tags: const [
            ['h', _channelA],
          ],
          content: 'Synthetic self root',
          sig: '',
        ),
      ];
      session.pauseNextUnreadCatchUpQuery();
      final started = session.nextUnreadCatchUpQueryStarted;
      await container.read(channelsProvider.notifier).refresh();
      await started;
      await _settle();
      final channelEmissions = <int>[];
      final interests = <ThreadInterestSnapshot>[];
      container.listen(
        channelsProvider,
        (_, next) => channelEmissions.add(next.requireValue.length),
      );
      container.listen(
        channelThreadInterestProvider,
        (_, next) => interests.add(next),
      );
      session.resumePausedUnreadCatchUpQuery();
      await _settle();
      expect(channelEmissions, isEmpty);
      expect(interests, hasLength(1));
      expect(interests.single.authored, {root});
      expect(
        initial.authored,
        isEmpty,
        reason: 'published snapshots cannot mutate in place',
      );
      expect(
        () => interests.single.authored.add('another'),
        throwsUnsupportedError,
      );

      final participated = '2'.padLeft(64, '0');
      session.emit(
        NostrEvent(
          id: '3'.padLeft(64, '0'),
          pubkey: 'me',
          kind: 9,
          createdAt: 101,
          tags: [
            ['h', _channelA],
            ['e', participated, '', 'reply'],
          ],
          content: 'Synthetic self reply',
          sig: '',
        ),
      );
      await _settle();
      expect(container.read(channelThreadInterestProvider).participated, {
        participated,
      });
      expect(container.read(channelThreadInterestProvider).authored, {root});
      final count = interests.length;
      session.emit(
        NostrEvent(
          id: '4'.padLeft(64, '0'),
          pubkey: 'me',
          kind: 9,
          createdAt: 102,
          tags: [
            ['h', _channelA],
            ['e', participated, '', 'reply'],
          ],
          content: 'Another synthetic reply',
          sig: '',
        ),
      );
      await _settle();
      expect(
        interests,
        hasLength(count),
        reason: 'existing interest is not republished',
      );
    },
  );
}

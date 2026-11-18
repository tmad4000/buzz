import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:buzz/features/channels/channel_messages_provider.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:buzz/features/channels/thread_replies_provider.dart';
import 'package:buzz/shared/offline/offline_cache.dart';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/offline/read_admission.dart';
import 'package:buzz/shared/relay/relay.dart';

class CommitSession extends RelaySessionNotifier {
  @override
  SessionState build() => const SessionState(status: SessionStatus.connected);
  @override
  Future<List<NostrEvent>> queryRelay(
    List<NostrFilter> filters, {
    Duration timeout = const Duration(seconds: 8),
  }) async => [
    const NostrEvent(
      id: 'reply',
      pubkey: 'alice',
      createdAt: 1001,
      kind: 9,
      tags: [
        ['h', 'general'],
        ['e', 'root', '', 'reply'],
      ],
      content: 'fresh body',
      sig: '',
    ),
  ];
}

class CommitLifecycle extends AppLifecycleNotifier {
  @override
  AppLifecycleState build() => AppLifecycleState.resumed;
}

class CommitConfig extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://relay.test');
}

class CommitChannel extends ChannelMessagesNotifier {
  CommitChannel() : super('general');
  @override
  AsyncValue<List<NostrEvent>> build() => const AsyncData([]);
  void arrive(NostrEvent event) {
    state = AsyncData([event]);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'live thread authority follows AsyncData commit and never waits for optional cache initialization',
    () async {
      final cache = Completer<OfflineCacheStore?>();
      final session = CommitSession();
      final container = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          offlineStoreProvider.overrideWith((ref) => cache.future),
          relayConfigProvider.overrideWith(CommitConfig.new),
          relaySessionProvider.overrideWith(() => session),
          appLifecycleProvider.overrideWith(CommitLifecycle.new),
        ],
      );
      addTearDown(container.dispose);
      const args = ThreadRepliesArgs(channelId: 'general', rootId: 'root');
      const sourceId = 'thread:general:root';
      container.read(offlineSourceProvider(sourceId).notifier).cached(1000);
      container.listen(
        threadRepliesProvider(args),
        (_, _) {},
        fireImmediately: true,
      );
      final result = await container
          .read(threadRepliesProvider(args).future)
          .timeout(const Duration(seconds: 2));
      expect(result.single.content, 'fresh body');
      expect(cache.isCompleted, isFalse);
      expect(container.read(threadRepliesProvider(args)).isLoading, isFalse);
      expect(container.read(readAdmissionProvider(sourceId)), isFalse);
      await Future<void>.delayed(Duration.zero);
      expect(container.read(readAdmissionProvider(sourceId)), isTrue);
      cache.complete(null);
      await container.pump();
    },
  );
  test('opened live thread persists arriving committed replies', () async {
    final root = await Directory.systemTemp.createTemp('buzz-live-thread-');
    addTearDown(() => root.delete(recursive: true));
    final store = OfflineCacheStore(
      root: root,
      scope: 'scope',
      cipher: Nip44OfflineCipher(Uint8List.fromList(List.filled(32, 7))),
    );
    final channel = CommitChannel();
    final container = ProviderContainer(
      overrides: [
        offlineEnabledProvider.overrideWithValue(true),
        offlineStoreProvider.overrideWith((ref) async => store),
        relayConfigProvider.overrideWith(CommitConfig.new),
        relaySessionProvider.overrideWith(CommitSession.new),
        appLifecycleProvider.overrideWith(CommitLifecycle.new),
        channelMessagesProvider('general').overrideWith(() => channel),
      ],
    );
    addTearDown(container.dispose);
    container.listen(
      channelMessagesProvider('general'),
      (_, _) {},
      fireImmediately: true,
    );
    const args = ThreadRepliesArgs(channelId: 'general', rootId: 'root');
    container.listen(
      threadRepliesProvider(args),
      (_, _) {},
      fireImmediately: true,
    );
    await container.read(threadRepliesProvider(args).future);
    channel.arrive(
      const NostrEvent(
        id: 'live',
        pubkey: 'alice',
        createdAt: 1002,
        kind: 9,
        tags: [
          ['h', 'general'],
          ['e', 'root', '', 'reply'],
        ],
        content: 'arriving body',
        sig: '',
      ),
    );
    OfflineSnapshot? snapshot;
    for (var attempt = 0; attempt < 80; attempt++) {
      snapshot = await store.load('thread', 'general:root');
      if (snapshot != null && (snapshot.payload as Map)['events'].length == 2)
        break;
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    expect(
      (snapshot?.payload as Map)['events']
          .map((dynamic event) => event['id'])
          .toSet(),
      {'reply', 'live'},
    );
  });
}

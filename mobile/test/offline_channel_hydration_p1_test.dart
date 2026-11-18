import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:buzz/shared/offline/offline_cache.dart';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/offline/read_admission.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:buzz/features/channels/channel_messages_provider.dart';

class CacheConfig extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://relay.test');
}

class CacheSession extends RelaySessionNotifier {
  final pending = Completer<List<NostrEvent>>();
  void Function(NostrEvent)? live;
  @override
  SessionState build() =>
      const SessionState(status: SessionStatus.disconnected);
  void connected() {
    state = const SessionState(status: SessionStatus.connected);
  }

  @override
  Future<void Function()> subscribe(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String)? onClosed,
    void Function(RelaySubscriptionStatus)? onStatusChanged,
    Duration timeout = const Duration(seconds: 8),
  }) async {
    live = onEvent;
    return () {};
  }

  @override
  Future<List<NostrEvent>> queryRelay(
    List<NostrFilter> filters, {
    Duration timeout = const Duration(seconds: 8),
  }) => pending.future;
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async => [];
}

class CacheLifecycle extends AppLifecycleNotifier {
  @override
  AppLifecycleState build() => AppLifecycleState.resumed;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'production channel notifier paints encrypted heads/summaries without authoritative read admission',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'buzz-cache-hydration-',
      );
      addTearDown(() => root.delete(recursive: true));
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: Nip44OfflineCipher(Uint8List.fromList(List.filled(32, 3))),
      );
      const event = NostrEvent(
        id: 'root',
        pubkey: 'alice',
        createdAt: 1000,
        kind: 9,
        tags: [
          ['h', 'general'],
        ],
        content: 'cached body',
        sig: '',
      );
      await store.save('head', 'general', {
        'events': [event.toJson()],
        'summaries': {
          'root': {
            'replyCount': 12,
            'descendantCount': 12,
            'lastReplyAt': 1001,
            'participantPubkeys': ['alice'],
          },
        },
      });
      final session = CacheSession();
      final container = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          offlineStoreProvider.overrideWith((ref) async => store),
          relayConfigProvider.overrideWith(CacheConfig.new),
          myPubkeyProvider.overrideWithValue('self'),
          relaySessionProvider.overrideWith(() => session),
          appLifecycleProvider.overrideWith(CacheLifecycle.new),
        ],
      );
      addTearDown(container.dispose);
      final ready = Completer<void>();
      container.listen(channelMessagesProvider('general'), (_, next) {
        if (next.value?.isNotEmpty == true && !ready.isCompleted) {
          ready.complete();
        }
      }, fireImmediately: true);
      await ready.future.timeout(const Duration(seconds: 5));
      expect(
        container
            .read(channelMessagesProvider('general'))
            .value
            ?.single
            .content,
        'cached body',
      );
      expect(
        container
            .read(channelMessagesProvider('general').notifier)
            .threadSummaries['root']
            ?.replyCount,
        12,
      );
      expect(container.read(readAdmissionProvider('head:general')), isFalse);
      session.connected();
      await container.pump();
      expect(container.read(readAdmissionProvider('head:general')), isFalse);
      expect(
        container
            .read(channelMessagesProvider('general'))
            .value
            ?.single
            .content,
        'cached body',
      );
      session.pending.complete([]);
      await container.pump();
    },
  );
}

import 'dart:io';
import 'dart:convert';

import 'package:buzz/shared/offline/offline_cache.dart';
import 'package:buzz/features/channels/channel_messages_provider.dart';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/profile/user_cache_provider.dart';
import 'package:buzz/shared/profile/user_profile.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import 'offline_cache_p1_test.dart' show ModelCipher, DelayedCipher;
import 'offline_channel_hydration_p1_test.dart'
    show CacheConfig, CacheSession, CacheLifecycle;

class RecoverySession extends RelaySessionNotifier {
  int calls = 0;
  bool fail = true;
  @override
  SessionState build() =>
      const SessionState(status: SessionStatus.disconnected);
  void connect() => state = const SessionState(status: SessionStatus.connected);
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    calls++;
    if (fail) throw StateError('offline');
    return const [
      NostrEvent(
        id: 'fresh',
        pubkey: 'alice',
        createdAt: 2,
        kind: 0,
        tags: [],
        content: '{"name":"Live Alice"}',
        sig: '',
      ),
    ];
  }
}

Future<void> until(bool Function() ready) async {
  for (var i = 0; i < 100; i++) {
    if (ready()) return;
    await Future<void>.delayed(const Duration(milliseconds: 20));
  }
  fail('condition did not settle');
}

final class WriteFailureOverrides extends IOOverrides {
  final String target;
  WriteFailureOverrides(this.target);
  @override
  File createFile(String path) {
    final file = super.createFile(path);
    return path == target ? PartialWriteFailure(file) : file;
  }
}

class PartialWriteFailure implements File {
  final File delegate;
  PartialWriteFailure(this.delegate);
  @override
  Future<File> writeAsString(
    String contents, {
    FileMode mode = FileMode.write,
    Encoding encoding = utf8,
    bool flush = false,
  }) async {
    await delegate.writeAsString(
      contents.substring(0, contents.length ~/ 2),
      flush: flush,
    );
    throw FileSystemException(
      'injected failure after partial temp write',
      delegate.path,
    );
  }

  @override
  Future<bool> exists() => delegate.exists();
  @override
  Future<FileSystemEntity> delete({bool recursive = false}) =>
      delegate.delete(recursive: recursive);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('pr90-recovery-');
  });
  tearDown(() async {
    await root.delete(recursive: true);
  });

  test(
    'disk label survives failed history but reconnect replaces it through production preload',
    () async {
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: ModelCipher(),
      );
      await store.save('profile', 'alice', {
        'pubkey': 'alice',
        'display_name': 'Disk Alice',
      });
      final session = RecoverySession();
      final c = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          offlineStoreProvider.overrideWith((ref) async => store),
          relayConfigProvider.overrideWith(CacheConfig.new),
          relaySessionProvider.overrideWith(() => session),
        ],
      );
      addTearDown(c.dispose);
      final cache = c.read(userCacheProvider.notifier);
      cache.get('alice');
      await until(
        () => c.read(userCacheProvider)['alice'] != null && session.calls > 0,
      );
      expect(c.read(userCacheProvider)['alice']?.displayName, 'Disk Alice');
      final beforeUse = session.calls;
      expect(cache.get('alice')?.displayName, 'Disk Alice');
      await until(() => session.calls > beforeUse);
      expect(await cache.preload(['alice']), isFalse);
      final before = session.calls;
      session.fail = false;
      session.connect();
      await until(
        () => c.read(userCacheProvider)['alice']?.displayName == 'Live Alice',
      );
      expect(session.calls, greaterThan(before));
      final after = session.calls;
      expect(cache.get('alice')?.displayName, 'Live Alice');
      await cache.preload(['alice']);
      expect(session.calls, after);
    },
  );

  test(
    'profile queue captured before clear cannot resurrect a later queued row',
    () async {
      final cipher = DelayedCipher();
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: cipher,
      );
      final c = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          offlineStoreProvider.overrideWith((ref) async => store),
          relayConfigProvider.overrideWith(CacheConfig.new),
        ],
      );
      addTearDown(c.dispose);
      final cache = c.read(userCacheProvider.notifier);
      cache.put(const UserProfile(pubkey: 'first', displayName: 'First'));
      await cipher.started.future;
      cache.put(const UserProfile(pubkey: 'queued', displayName: 'Queued'));
      await store.clear();
      cipher.release.complete();
      await Future<void>.delayed(const Duration(milliseconds: 300));
      expect(await store.load('profile', 'first'), isNull);
      expect(await store.load('profile', 'queued'), isNull);
      cache.put(const UserProfile(pubkey: 'new', displayName: 'After clear'));
      await until(
        () => Directory(
          '${root.path}/${offlineHash('scope')}/profile',
        ).existsSync(),
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(
        (await store.load('profile', 'new'))?.payload['display_name'],
        'After clear',
      );
    },
  );

  test(
    'production head debounce scheduled before clear stays cleared on timer and cancel',
    () async {
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: ModelCipher(),
      );
      final session = CacheSession();
      final c = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          offlineStoreProvider.overrideWith((ref) async => store),
          relayConfigProvider.overrideWith(CacheConfig.new),
          relaySessionProvider.overrideWith(() => session),
          myPubkeyProvider.overrideWithValue('self'),
          appLifecycleProvider.overrideWith(CacheLifecycle.new),
        ],
      );
      addTearDown(c.dispose);
      final sub = c.listen(
        channelMessagesProvider('general'),
        (_, _) {},
        fireImmediately: true,
      );
      session.connected();
      session.pending.complete([]);
      await until(
        () =>
            c.read(channelMessagesProvider('general')).hasValue &&
            session.live != null,
      );
      await Future<void>.delayed(const Duration(milliseconds: 100));
      session.live!(
        const NostrEvent(
          id: 'live',
          pubkey: 'alice',
          createdAt: 1002,
          kind: 9,
          tags: [
            ['h', 'general'],
          ],
          content: 'queued before clear',
          sig: '',
        ),
      );
      await store.clear();
      await Future<void>.delayed(const Duration(milliseconds: 2200));
      expect(await store.load('head', 'general'), isNull);
      sub.close();
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(await store.load('head', 'general'), isNull);
      final resumed = c.listen(channelMessagesProvider('general'), (_, _) {});
      session.live!(
        const NostrEvent(
          id: 'genuinely-new',
          pubkey: 'alice',
          createdAt: 1003,
          kind: 9,
          tags: [
            ['h', 'general'],
          ],
          content: 'arrived after clear',
          sig: '',
        ),
      );
      await Future<void>.delayed(const Duration(milliseconds: 2300));
      final fresh = await store.load('head', 'general');
      expect(
        (fresh?.payload as Map)['events'].any(
          (dynamic e) => e['id'] == 'genuinely-new',
        ),
        isTrue,
      );
      resumed.close();
    },
  );

  for (final kind in ['record', 'index']) {
    test(
      '$kind rename failure deletes temp, and cold scan sweeps index temp',
      () async {
        final store = OfflineCacheStore(
          root: root,
          scope: 'scope',
          cipher: ModelCipher(),
        );
        final scopeDir = '${root.path}/${offlineHash('scope')}';
        final target = kind == 'record'
            ? '$scopeDir/head/${offlineHash('general')}.json'
            : '$scopeDir/index.json';
        await Directory(target).create(recursive: true);
        await expectLater(
          store.save('head', 'general', ['body']),
          throwsA(isA<FileSystemException>()),
        );
        expect(File('$target.tmp').existsSync(), isFalse);
        await File('$scopeDir/index.json.tmp').writeAsString('crash residue');
        OfflineCacheStore.debugDropMetadataCache(root, 'scope');
        await store.recent('head', 12);
        expect(File('$scopeDir/index.json.tmp').existsSync(), isFalse);
      },
    );
  }
  for (final cold in [false, true]) {
    test(
      '${cold ? "cold" : "warm"} metadata cleanup sweeps kind and index temps',
      () async {
        final store = OfflineCacheStore(
          root: root,
          scope: 'scope',
          cipher: ModelCipher(),
        );
        await store.save('head', 'general', ['committed']);
        final scopeDir = '${root.path}/${offlineHash('scope')}';
        final paths = [
          '$scopeDir/index.json.tmp',
          for (final kind in offlineCaps.keys)
            '$scopeDir/$kind/orphan.json.tmp',
        ];
        for (final path in paths) {
          final file = File(path);
          await file.parent.create(recursive: true);
          await file.writeAsString('orphan ciphertext');
        }
        if (cold) OfflineCacheStore.debugDropMetadataCache(root, 'scope');
        expect(await store.recent('head', 12), hasLength(1));
        for (final path in paths) {
          expect(await File(path).exists(), isFalse);
        }
        expect((await store.load('head', 'general'))?.payload, ['committed']);
      },
    );
  }
  for (final kind in ['record', 'index']) {
    test('$kind partial write failure deletes temp in finally', () async {
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: ModelCipher(),
      );
      final scopeDir = '${root.path}/${offlineHash('scope')}';
      final target = kind == 'record'
          ? '$scopeDir/head/${offlineHash('general')}.json.tmp'
          : '$scopeDir/index.json.tmp';
      await IOOverrides.runWithIOOverrides(() async {
        await expectLater(
          store.save('head', 'general', ['body']),
          throwsA(isA<FileSystemException>()),
        );
      }, WriteFailureOverrides(target));
      expect(await File(target).exists(), isFalse);
    });
  }
}

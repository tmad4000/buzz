import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:buzz/shared/offline/offline_cache.dart';

class ModelCipher implements OfflinePayloadCipher {
  @override
  Future<String> seal(Map<String, dynamic> value) async =>
      base64Encode(utf8.encode(jsonEncode(value)));
  @override
  Future<Map<String, dynamic>> open(String value) async =>
      jsonDecode(utf8.decode(base64Decode(value))) as Map<String, dynamic>;
}

class DelayedCipher extends ModelCipher {
  final started = Completer<void>();
  final release = Completer<void>();
  @override
  Future<String> seal(Map<String, dynamic> value) async {
    started.complete();
    await release.future;
    return super.seal(value);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory root;
  setUp(() async {
    root = await Directory.systemTemp.createTemp('buzz-offline-p1-');
  });
  tearDown(() async {
    if (await root.exists()) await root.delete(recursive: true);
  });
  test(
    'actual NIP44 file roundtrip survives new store, Unicode chunks, and isolates scopes',
    () async {
      final cipher = Nip44OfflineCipher(Uint8List.fromList(List.filled(32, 7)));
      final store = OfflineCacheStore(
        root: root,
        scope: 'account:relay-a',
        cipher: cipher,
      );
      final payload = {'text': '${'x' * 7900}${'🐝' * 18000}'};
      await store.save('head', 'general', payload);
      final files = await root
          .list(recursive: true)
          .where((entry) => entry is File && entry.path.contains('/head/'))
          .cast<File>()
          .toList();
      expect(files, hasLength(1));
      final bytes = await files.single.readAsString();
      expect(bytes.contains('🐝'), isFalse);
      expect(bytes.contains('general'), isFalse);
      final restarted = OfflineCacheStore(
        root: root,
        scope: 'account:relay-a',
        cipher: cipher,
      );
      expect((await restarted.load('head', 'general'))?.payload, payload);
      final other = OfflineCacheStore(
        root: root,
        scope: 'account:relay-b',
        cipher: cipher,
      );
      expect(await other.load('head', 'general'), isNull);
      // A copied ciphertext cannot be relabeled into another scope.
      final copied = File(
        '${root.path}/${offlineHash('account:relay-b')}/head/${offlineHash('general')}.json',
      );
      await copied.parent.create(recursive: true);
      await copied.writeAsString(bytes);
      expect(await other.load('head', 'general'), isNull);
      await restarted.clear();
      expect(await restarted.load('head', 'general'), isNull);
    },
  );
  test(
    'file model caps heads/threads and rejects oversized complete units',
    () async {
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: ModelCipher(),
      );
      for (var i = 0; i < 67; i++) {
        await store.save('head', 'channel-$i', {'i': i});
      }
      expect(await store.recent('head', 100), hasLength(64));
      expect(await store.load('head', 'channel-0'), isNull);
      for (var i = 0; i < 203; i++) {
        await store.save('thread', 'thread-$i', {'i': i});
      }
      expect(await store.recent('thread', 300), hasLength(200));
      await store.save('profile', 'large', {'text': 'x' * 33000});
      expect(await store.load('profile', 'large'), isNull);
      // Restart reconstructs LRU from committed files even if the secondary index was interrupted.
      final index = File('${root.path}/${offlineHash('scope')}/index.json');
      await index.writeAsString('{broken');
      OfflineCacheStore.debugDropMetadataCache(root, 'scope');
      final restarted = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: ModelCipher(),
      );
      expect(await restarted.recent('head', 100), hasLength(64));
    },
    timeout: const Timeout(Duration(seconds: 90)),
  );
  test(
    'production LRU enforces byte budget and retired scopes cannot refill',
    () async {
      final rows = [
        for (var i = 0; i < 60; i++)
          (
            file: File('/synthetic/$i'),
            kind: 'head',
            visited: i,
            bytes: 1024 * 1024,
          ),
      ];
      final kept = offlineRetainedRecords(rows);
      expect(kept, hasLength(48));
      expect(kept.any((row) => row.visited < 12), isFalse);
      final store = OfflineCacheStore(
        root: root,
        scope: 'retired',
        cipher: ModelCipher(),
      );
      await store.save('head', 'a', ['cached']);
      await OfflineCacheStore.clearScope(root, 'retired', retire: true);
      await store.save('head', 'b', ['queued-before-logout']);
      expect(await store.load('head', 'b'), isNull);
    },
  );
  test(
    'clear fences encryption in flight and leaves no committed payload',
    () async {
      final cipher = DelayedCipher();
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope',
        cipher: cipher,
      );
      final saving = store.save('sidebar', 'sidebar', ['private']);
      await cipher.started.future;
      await store.clear();
      cipher.release.complete();
      await saving;
      expect(await store.load('sidebar', 'sidebar'), isNull);
    },
  );
}

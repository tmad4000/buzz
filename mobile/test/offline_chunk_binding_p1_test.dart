import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:buzz/shared/crypto/nip44.dart';
import 'package:buzz/shared/offline/offline_cache.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final key = Uint8List.fromList(List.filled(32, 9));
  final cipher = Nip44OfflineCipher(key);
  Map<String, dynamic> record({
    String scope = 'scope-a',
    String id = 'general',
    String kind = 'head',
  }) => {
    'version': 1,
    'scope': scope,
    'kind': kind,
    'id': id,
    'savedAt': 123,
    'payload': {'text': '${'a' * 7900}${'🐝' * 9000}'},
  };
  List<String> chunks(String ciphertext) =>
      (jsonDecode(ciphertext) as List).cast<String>();
  Map<String, dynamic> openChunk(String chunk) =>
      jsonDecode(nip44Decrypt(key, chunk)) as Map<String, dynamic>;

  test(
    'every real NIP44 chunk authenticates routing, index, count and unique bundle',
    () async {
      final payload = record();
      final sealed = chunks(await cipher.seal(payload));
      expect(sealed.length, greaterThan(2));
      final bundle = openChunk(sealed.first)['bundleId'];
      for (var i = 0; i < sealed.length; i++) {
        final header = openChunk(sealed[i]);
        expect(header['version'], 2);
        expect(header['scope'], payload['scope']);
        expect(header['kind'], payload['kind']);
        expect(header['id'], payload['id']);
        expect(header['index'], i);
        expect(header['count'], sealed.length);
        expect(header['bundleId'], bundle);
      }
      expect(await cipher.open(jsonEncode(sealed)), payload);
      final another = chunks(await cipher.seal(payload));
      expect(openChunk(another.first)['bundleId'], isNot(bundle));
    },
  );

  for (final attack in [
    'splice-record',
    'splice-scope',
    'splice-kind',
    'cross-bundle',
    'reorder',
    'omit',
    'duplicate',
  ]) {
    test('real NIP44 reassembly rejects $attack', () async {
      final original = chunks(await cipher.seal(record()));
      final donor = chunks(
        await cipher.seal(
          record(
            id: attack == 'splice-record' ? 'other' : 'general',
            scope: attack == 'splice-scope' ? 'scope-b' : 'scope-a',
            kind: attack == 'splice-kind' ? 'thread' : 'head',
          ),
        ),
      );
      final changed = [...original];
      switch (attack) {
        case 'reorder':
          final first = changed[0];
          changed[0] = changed[1];
          changed[1] = first;
        case 'omit':
          changed.removeAt(1);
        case 'duplicate':
          changed[1] = changed[0];
        default:
          changed[1] = donor[1];
      }
      await expectLater(
        cipher.open(jsonEncode(changed)),
        throwsA(isA<FormatException>()),
      );
    });
  }

  for (final field in [
    'scope',
    'kind',
    'id',
    'index',
    'count',
    'bundleId',
    'digest',
  ]) {
    for (final position in [0, 1]) {
      test(
        'real authenticated $field mismatch rejected at chunk $position',
        () async {
          final sealed = chunks(await cipher.seal(record()));
          final changed = openChunk(sealed[position]);
          changed[field] = switch (field) {
            'index' => position + 1,
            'count' => sealed.length + 1,
            'bundleId' => 'z' * 44,
            _ => 'tampered',
          };
          // Re-encrypt with a valid NIP44 MAC: this must fail header binding,
          // rather than only the cipher's ordinary ciphertext authentication.
          sealed[position] = nip44Encrypt(key, jsonEncode(changed));
          await expectLater(
            cipher.open(jsonEncode(sealed)),
            throwsA(isA<FormatException>()),
          );
        },
      );
    }
  }

  test(
    'fully consistent alternate routing headers still must match assembled record',
    () async {
      final sealed = chunks(await cipher.seal(record()));
      for (var i = 0; i < sealed.length; i++) {
        final header = openChunk(sealed[i]);
        header['id'] = 'other';
        sealed[i] = nip44Encrypt(key, jsonEncode(header));
      }
      await expectLater(
        cipher.open(jsonEncode(sealed)),
        throwsA(isA<FormatException>()),
      );
    },
  );

  test(
    'store rejects whole ciphertext swapped to another scope, record or kind',
    () async {
      final root = await Directory.systemTemp.createTemp('buzz-bound-chunks-');
      addTearDown(() => root.delete(recursive: true));
      final store = OfflineCacheStore(
        root: root,
        scope: 'scope-a',
        cipher: cipher,
      );
      await store.save('head', 'general', record()['payload']);
      final original = File(
        '${root.path}/${offlineHash('scope-a')}/head/${offlineHash('general')}.json',
      );
      final bytes = await original.readAsString();
      for (final target in [
        (scope: 'scope-b', kind: 'head', id: 'general'),
        (scope: 'scope-a', kind: 'head', id: 'other'),
        (scope: 'scope-a', kind: 'thread', id: 'general'),
      ]) {
        final file = File(
          '${root.path}/${offlineHash(target.scope)}/${target.kind}/${offlineHash(target.id)}.json',
        );
        await file.parent.create(recursive: true);
        await file.writeAsString(bytes);
        final other = OfflineCacheStore(
          root: root,
          scope: target.scope,
          cipher: cipher,
        );
        expect(await other.load(target.kind, target.id), isNull);
      }
      expect(
        (await store.load('head', 'general'))?.payload,
        record()['payload'],
      );
    },
  );

  test(
    'legacy digest-manifest-only ciphertext is an optional cache miss',
    () async {
      final payload = record();
      final text = jsonEncode(payload);
      final legacy = jsonEncode([
        nip44Encrypt(
          key,
          jsonEncode({'digest': offlineHash(text), 'count': 1}),
        ),
        nip44Encrypt(key, text),
      ]);
      await expectLater(cipher.open(legacy), throwsA(isA<FormatException>()));
    },
  );
}

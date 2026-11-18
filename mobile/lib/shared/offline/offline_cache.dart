import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:pointycastle/digests/sha256.dart';

import '../crypto/nip44.dart';

/// One seam for the recommended all-payload NIP-44-to-self policy.
abstract interface class OfflinePayloadCipher {
  Future<String> seal(Map<String, dynamic> payload);
  Future<Map<String, dynamic>> open(String ciphertext);
}

/// Expensive JSON/crypto runs off the UI isolate; no plaintext is written to disk.
class Nip44OfflineCipher implements OfflinePayloadCipher {
  final Uint8List conversationKey;
  Nip44OfflineCipher(this.conversationKey);
  @override
  Future<String> seal(Map<String, dynamic> payload) =>
      compute(_seal, (conversationKey, payload));
  @override
  Future<Map<String, dynamic>> open(String ciphertext) =>
      compute(_open, (conversationKey, ciphertext));
}

String _seal((Uint8List, Map<String, dynamic>) args) {
  final text = jsonEncode(args.$2);
  final chunks = <String>[];
  for (var start = 0; start < text.length;) {
    var end = (start + 8000).clamp(0, text.length);
    if (end < text.length &&
        text.codeUnitAt(end - 1) >= 0xd800 &&
        text.codeUnitAt(end - 1) <= 0xdbff) {
      end--;
    }
    chunks.add(nip44Encrypt(args.$1, text.substring(start, end)));
    start = end;
  }
  chunks.insert(
    0,
    nip44Encrypt(
      args.$1,
      jsonEncode({'digest': offlineHash(text), 'count': chunks.length}),
    ),
  );
  return jsonEncode(chunks);
}

Map<String, dynamic> _open((Uint8List, String) args) {
  final chunks = (jsonDecode(args.$2) as List).cast<String>();
  if (chunks.isEmpty || chunks.length > 140) {
    throw const FormatException('Invalid offline chunks');
  }
  final manifest = jsonDecode(nip44Decrypt(args.$1, chunks.first)) as Map;
  final text = chunks
      .skip(1)
      .map((chunk) => nip44Decrypt(args.$1, chunk))
      .join();
  if (manifest['count'] != chunks.length - 1 ||
      manifest['digest'] != offlineHash(text)) {
    throw const FormatException('Offline chunk integrity mismatch');
  }
  return jsonDecode(text) as Map<String, dynamic>;
}

String offlineHash(String value) => SHA256Digest()
    .process(Uint8List.fromList(utf8.encode(value)))
    .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
    .join();

const offlineCaps = <String, (int, int)>{
  'head': (64, 1024 * 1024),
  'thread': (200, 256 * 1024),
  'sidebar': (1, 1024 * 1024),
  'profile': (2000, 32 * 1024),
};
const offlineScopeByteCap = 48 * 1024 * 1024;

typedef OfflineFileMetadata = ({
  File file,
  String kind,
  int visited,
  int bytes,
});

/// Shared production LRU policy: each type cap and total on-disk bytes apply together.
List<OfflineFileMetadata> offlineRetainedRecords(
  Iterable<OfflineFileMetadata> records,
) {
  final rows = records.toList()..sort((a, b) => b.visited.compareTo(a.visited));
  final counts = <String, int>{};
  var bytes = 0;
  return rows.where((row) {
    final count = counts.update(
      row.kind,
      (value) => value + 1,
      ifAbsent: () => 1,
    );
    if (count > offlineCaps[row.kind]!.$1 ||
        bytes + row.bytes > offlineScopeByteCap) {
      return false;
    }
    bytes += row.bytes;
    return true;
  }).toList();
}

class OfflineSnapshot {
  final String id;
  final dynamic payload;
  final int savedAt;
  const OfflineSnapshot(this.id, this.payload, this.savedAt);
}

/// Application Support file store. All paths are hashes; index metadata contains no bodies/IDs.
/// Atomic record rename is the commit point. The index is rebuildable from records after a crash.
class OfflineCacheStore {
  final Directory root;
  final String scope;
  final OfflinePayloadCipher cipher;
  static int _clearClock = 0;
  static final _clearedAt = <String, int>{};

  /// Capture synchronously when producer work is enqueued, before any awaits.
  static int get writeEpoch => _clearClock;

  static final _retired = <String>{};
  static final _recordCaches =
      <String, List<({File file, String kind, int visited, int bytes})>>{};
  static final _visitClocks = <String, int>{};
  int _visit() {
    final now = DateTime.now().millisecondsSinceEpoch;
    final previous = _visitClocks[_key] ?? 0;
    final next = now > previous ? now : previous + 1;
    _visitClocks[_key] = next;
    return next;
  }

  static final _tails = <String, Future<void>>{};
  static final _generations = <String, int>{};
  static final _pendingWrites = <String, Object>{};
  OfflineCacheStore({
    required this.root,
    required this.scope,
    required this.cipher,
  }) {
    _retired.remove(_key);
  }
  String get _key => '${root.path}/${offlineHash(scope)}';
  Directory get _dir => Directory(_key);
  File _file(String kind, String id) =>
      File('$_key/$kind/${offlineHash(id)}.json');
  Future<T> _serial<T>(Future<T> Function() action) {
    final result = (_tails[_key] ?? Future.value()).then((_) => action());
    _tails[_key] = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return result;
  }

  Future<void> _atomic(File file, String value) async {
    await file.parent.create(recursive: true);
    final temp = File('${file.path}.tmp');
    try {
      await temp.writeAsString(value, flush: true);
      await temp.rename(file.path);
    } finally {
      if (await temp.exists()) await temp.delete();
    }
  }

  Future<void> save(
    String kind,
    String id,
    dynamic payload, {
    int? epoch,
  }) async {
    if ((_clearedAt[_key] ?? 0) > (epoch ?? writeEpoch)) return;
    if (_retired.contains(_key)) return;
    final cap = offlineCaps[kind];
    if (cap == null) throw ArgumentError.value(kind);
    final writeKey = '$_key/$kind/${offlineHash(id)}';
    final token = Object();
    _pendingWrites[writeKey] = token;
    try {
      final generation = _generations[_key] ?? 0;
      final now = DateTime.now().millisecondsSinceEpoch;
      final envelope = <String, dynamic>{
        'version': 1,
        'scope': scope,
        'kind': kind,
        'id': id,
        'savedAt': now,
        'payload': payload,
      };
      // Bound serialization before encryption and reject whole units, never partial JSON.
      final size = await compute(_jsonBytes, envelope);
      if (size > cap.$2) return;
      final ciphertext = await cipher.seal(envelope);
      if (utf8.encode(ciphertext).length > cap.$2 * 3) return;
      await _serial(() async {
        if (_pendingWrites[writeKey] != token ||
            (_generations[_key] ?? 0) != generation ||
            _retired.contains(_key)) {
          return;
        }
        await _atomic(
          _file(kind, id),
          jsonEncode({
            'savedAt': now,
            'lastVisitedAt': _visit(),
            'bytes': utf8.encode(ciphertext).length,
            'ciphertext': ciphertext,
          }),
        );
        final cached = _recordCaches[_key];
        if (cached != null) {
          final file = _file(kind, id);
          cached.removeWhere((row) => row.file.path == file.path);
          cached.add((
            file: file,
            kind: kind,
            visited: _visitClocks[_key]!,
            bytes: await file.length(),
          ));
        }
        await _evictAndIndex();
      });
    } finally {
      if (_pendingWrites[writeKey] == token) _pendingWrites.remove(writeKey);
    }
  }

  Future<OfflineSnapshot?> load(String kind, String id) => _serial(() async {
    if (_retired.contains(_key)) return null;
    final file = _file(kind, id);
    if (!await file.exists()) return null;
    return _read(file, kind, id: id);
  });

  Future<List<OfflineSnapshot>> recent(String kind, int limit) => _serial(
    () async {
      final rows = (await _records()).where((row) => row.kind == kind).toList()
        ..sort((a, b) => b.visited.compareTo(a.visited));
      final result = <OfflineSnapshot>[];
      for (final row in rows.take(limit.clamp(0, offlineCaps[kind]!.$1))) {
        final snapshot = await _read(row.file, kind);
        if (snapshot != null) result.add(snapshot);
      }
      return result;
    },
  );

  Future<OfflineSnapshot?> _read(File file, String kind, {String? id}) async {
    try {
      final cap = offlineCaps[kind]!.$2 * 3;
      if (await file.length() > cap + 1024) return null;
      final row = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final ciphertext = row['ciphertext'] as String;
      if (utf8.encode(ciphertext).length > cap) return null;
      final generation = _generations[_key] ?? 0;
      final envelope = await cipher.open(ciphertext);
      if (_retired.contains(_key) || (_generations[_key] ?? 0) != generation) {
        return null;
      }
      if (envelope['version'] != 1 ||
          envelope['scope'] != scope ||
          envelope['kind'] != kind ||
          envelope['savedAt'] != row['savedAt'] ||
          (id != null && envelope['id'] != id) ||
          offlineHash(envelope['id'] as String) !=
              file.uri.pathSegments.last.split('.').first) {
        return null;
      }
      row['lastVisitedAt'] = _visit();
      await _atomic(file, jsonEncode(row));
      final cached = _recordCaches[_key];
      if (cached != null) {
        cached.removeWhere((entry) => entry.file.path == file.path);
        cached.add((
          file: file,
          kind: kind,
          visited: row['lastVisitedAt'] as int,
          bytes: await file.length(),
        ));
      }
      return OfflineSnapshot(
        envelope['id'] as String,
        envelope['payload'],
        envelope['savedAt'] as int,
      );
    } on FormatException {
      return null;
    } on TypeError {
      return null;
    }
  }

  Future<List<({File file, String kind, int visited, int bytes})>>
  _records() async {
    final existing = _recordCaches[_key];
    final result = <({File file, String kind, int visited, int bytes})>[];
    if (!await _dir.exists()) return result;
    final indexTemp = File('$_key/index.json.tmp');
    if (await indexTemp.exists()) await indexTemp.delete();
    for (final kind in offlineCaps.keys) {
      final dir = Directory('$_key/$kind');
      if (!await dir.exists()) continue;
      await for (final entity in dir.list(followLinks: false)) {
        if (entity is File && entity.path.endsWith('.tmp')) {
          await entity.delete();
          continue;
        }
        if (existing != null ||
            entity is! File ||
            !entity.path.endsWith('.json'))
          continue;
        final bytes = await entity.length();
        if (bytes > offlineCaps[kind]!.$2 * 3 + 1024) {
          await entity.delete();
          continue;
        }
        try {
          final row =
              jsonDecode(await entity.readAsString()) as Map<String, dynamic>;
          result.add((
            file: entity,
            kind: kind,
            visited: row['lastVisitedAt'] as int,
            bytes: bytes,
          ));
        } on FormatException {
          await entity.delete();
        } on TypeError {
          await entity.delete();
        }
      }
    }
    if (existing != null) return [...existing];
    _recordCaches[_key] = [...result];
    for (final row in result) {
      if (row.visited > (_visitClocks[_key] ?? 0)) {
        _visitClocks[_key] = row.visited;
      }
    }
    return result;
  }

  Future<void> _evictAndIndex() async {
    final rows = await _records();
    final retained = offlineRetainedRecords(rows);
    final kept = retained.map((row) => row.file.path).toSet();
    for (final row in rows) {
      if (!kept.contains(row.file.path)) await row.file.delete();
    }
    _recordCaches[_key] = retained;
    await _atomic(
      File('$_key/index.json'),
      jsonEncode([
        for (final row in retained)
          {
            'file': row.file.path.substring(_key.length + 1),
            'visited': row.visited,
            'bytes': row.bytes,
          },
      ]),
    );
  }

  @visibleForTesting
  static void debugDropMetadataCache(Directory root, String scope) {
    final key = '${root.path}/${offlineHash(scope)}';
    _recordCaches.remove(key);
    _visitClocks.remove(key);
  }

  Future<void> clear() => clearScope(root, scope);

  /// Clears encrypted bytes before removing the owning identity/community.
  static Future<void> clearScope(
    Directory root,
    String scope, {
    bool retire = false,
  }) {
    final key = '${root.path}/${offlineHash(scope)}';
    _clearedAt[key] = ++_clearClock;
    if (retire) _retired.add(key);
    _generations[key] = (_generations[key] ?? 0) + 1;
    final result = (_tails[key] ?? Future<void>.value()).then((_) async {
      _recordCaches.remove(key);
      _visitClocks.remove(key);
      final dir = Directory(key);
      if (await dir.exists()) await dir.delete(recursive: true);
    });
    _tails[key] = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return result;
  }
}

int _jsonBytes(Map<String, dynamic> value) =>
    utf8.encode(jsonEncode(value)).length;

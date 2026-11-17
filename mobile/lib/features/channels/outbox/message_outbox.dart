import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:uuid/uuid.dart';

import '../../../shared/relay/relay.dart';

/// An attachment whose original bytes must be committed before clearing a draft.
class OutboxAttachment {
  final XFile file;
  final String kind;
  final Duration? duration;
  const OutboxAttachment(this.file, this.kind, {this.duration});
}

/// Device-local pending data. This lives outside disposable message caches.
class OutboxItem {
  final Map<String, dynamic> data;
  OutboxItem(Map<String, dynamic> data) : data = Map.unmodifiable(data);
  String get id => data['id'] as String;
  int get revision => data['revision'] as int;
  int get sequence => data['sequence'] as int;
  String get relay => data['relay'] as String;
  String get author => data['author'] as String;
  String get channelId => data['channelId'] as String;
  String? get parentId => data['parentId'] as String?;
  String? get rootId => data['rootId'] as String?;
  String get text => data['text'] as String;
  String get state => data['state'] as String;
  String? get error => data['error'] as String?;
  int get intendedAt => data['intendedAt'] as int;
  int get retryAt => data['retryAt'] as int;
  List<Map<String, dynamic>> get attachments =>
      (data['attachments'] as List).cast<Map<String, dynamic>>();
  List<String> get signedIds => (data['signedIds'] as List).cast<String>();
  NostrEvent? get signed => data['signed'] == null
      ? null
      : NostrEvent.fromJson(data['signed'] as Map<String, dynamic>);
  bool get uncertain => data['uncertain'] == true;
  String get lane =>
      '$relay\u0000$author\u0000$channelId\u0000${rootId ?? parentId ?? ""}';
  OutboxItem patch(Map<String, dynamic> changes) =>
      OutboxItem({...data, ...changes, 'revision': revision + 1});
}

/// The transport is captured for one relay/account; it may never retarget I/O.
abstract interface class OutboxTransport {
  bool matches(OutboxItem item);
  Future<BlobDescriptor> upload(
    OutboxItem item,
    Map<String, dynamic> attachment,
    void Function(double) progress,
  );
  Future<NostrEvent> prepare(OutboxItem item);
  Future<({NostrEvent? event, bool deleted})> find(OutboxItem item);
  Future<void> publish(OutboxItem item);
  void accepted(OutboxItem item, NostrEvent event);
}

/// Atomic row files and copied original attachments, protected by a process lock.
/// A row rename is the commit point. No signing key is written to this store.
class MessageOutbox extends ChangeNotifier {
  final Directory directory;
  final DateTime Function() now;
  final double Function() jitter;
  MessageOutbox(
    this.directory, {
    DateTime Function()? now,
    double Function()? jitter,
  }) : now = now ?? DateTime.now,
       jitter = jitter ?? Random().nextDouble;
  final Map<String, OutboxItem> _rows = {};
  List<OutboxItem> get items =>
      _rows.values.toList()..sort((a, b) => a.sequence.compareTo(b.sequence));
  final Map<String, double> progress = {};
  final Set<String> publishing = {};
  void _checkMutable(String id) {
    if (publishing.contains(id)) {
      throw StateError('Publication is in progress. Wait for its result.');
    }
  }

  Future<void> _serial = Future.value();
  Future<void>? _opening;
  RandomAccessFile? _lock;
  bool _running = false;
  bool _closed = false;
  Timer? _timer;
  OutboxTransport? _transport;
  String? storageError;

  Future<T> _mutate<T>(Future<T> Function() action) {
    final result = _serial.then((_) => action());
    _serial = result.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return result;
  }

  Future<void> open() => _opening ??= _mutate(() async {
    await directory.create(recursive: true);
    final lock = await File(
      '${directory.path}/worker.lock',
    ).open(mode: FileMode.append);
    try {
      await lock.lock(FileLock.exclusive);
    } catch (_) {
      await lock.close();
      rethrow;
    }
    _lock = lock;
    await for (final entry in directory.list()) {
      if (entry is! Directory) continue;
      final file = File('${entry.path}/message.json');
      if (!await file.exists()) continue; // Interrupted pre-commit copy.
      // Do not erase malformed durable data; surface a recoverable storage error.
      final data =
          jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      if (data['version'] != 1 ||
          data['id'] !=
              entry.uri.pathSegments.where((s) => s.isNotEmpty).last) {
        throw const FormatException('Unsupported outbox record');
      }
      final row = OutboxItem(data);
      _rows[row.id] = row;
    }
    notifyListeners();
  });

  Future<void> _write(OutboxItem row) async {
    final folder = Directory('${directory.path}/${row.id}');
    await folder.create(recursive: true);
    final temporary = File('${folder.path}/message.json.tmp');
    await temporary.writeAsString(jsonEncode(row.data), flush: true);
    await temporary.rename('${folder.path}/message.json');
    _rows[row.id] = row;
    notifyListeners();
  }

  Future<void> _checkpoint(OutboxItem previous, OutboxItem next) =>
      _mutate(() async {
        if (_rows[previous.id]?.revision != previous.revision) {
          throw const OutboxChanged();
        }
        await _write(next);
      });

  /// Copy every selected byte, then commit metadata; only then may the UI clear.
  Future<OutboxItem> enqueue(
    Map<String, dynamic> message,
    List<OutboxAttachment> files,
  ) async {
    await open();
    final row = await _mutate(() async {
      final id = const Uuid().v4();
      final folder = await Directory('${directory.path}/$id').create();
      final attachments = await _copyFiles(folder, files);
      final sequence = max(
        now().microsecondsSinceEpoch,
        _rows.values.fold<int>(0, (n, row) => max(n, row.sequence)) + 1,
      );
      final row = OutboxItem({
        ...message,
        'version': 1,
        'id': id,
        'revision': 0,
        'sequence': sequence,
        'intendedAt': now().millisecondsSinceEpoch ~/ 1000,
        'attachments': attachments,
        'signedIds': <String>[],
        'signed': null,
        'state': 'waiting',
        'retryAt': 0,
        'attempts': 0,
        'uncertain': false,
      });
      await _write(row);
      return row;
    });
    wake();
    return row;
  }

  Future<List<Map<String, dynamic>>> _copyFiles(
    Directory folder,
    List<OutboxAttachment> files,
  ) async {
    final attachments = <Map<String, dynamic>>[];
    for (final attachment in files) {
      final name = attachment.file.name;
      final extension =
          RegExp(r'\.[a-zA-Z0-9]{1,10}$').firstMatch(name)?.group(0) ?? '';
      final target = File('${folder.path}/${const Uuid().v4()}$extension');
      final input = attachment.file.openRead();
      final sink = target.openWrite();
      await sink.addStream(input);
      await sink.flush();
      await sink.close();
      // A flushed RandomAccessFile makes the original bytes durable before metadata.
      final handle = await target.open(mode: FileMode.append);
      await handle.flush();
      await handle.close();
      attachments.add({
        'path': target.path,
        'name': name,
        'kind': attachment.kind,
        'durationMs': attachment.duration?.inMilliseconds,
        'descriptor': null,
      });
    }
    return attachments;
  }

  Future<void> retry(String id) async {
    await open();
    await _mutate(() async {
      _checkMutable(id);
      final row = _rows[id];
      if (row == null) return;
      await _write(
        row.patch({'state': 'waiting', 'error': null, 'retryAt': 0}),
      );
    });
    wake();
  }

  /// Pause before editing. Ambiguous publication must first resolve by Retry.
  Future<OutboxItem> pause(String id) async {
    await open();
    return _mutate(() async {
      _checkMutable(id);
      final row = _rows[id];
      if (row == null) throw const OutboxChanged();
      if (row.uncertain) {
        throw StateError('Retry to check delivery before editing.');
      }
      final next = row.patch({'state': 'editing'});
      await _write(next);
      return next;
    });
  }

  /// Keep existing bytes and destination while replacing the authored payload.
  Future<void> edit(
    OutboxItem expected,
    Map<String, dynamic> payload,
    List<OutboxAttachment> files,
  ) async {
    final attachments = await _copyFiles(
      Directory('${directory.path}/${expected.id}'),
      files,
    );
    final next = expected.patch({
      ...payload,
      'attachments': attachments,
      'state': 'waiting',
      'error': null,
      'retryAt': 0,
      'signed': null,
      'signedIds': <String>[],
      'uncertain': false,
    });
    await _checkpoint(expected, next);
    wake();
  }

  Future<void> remove(String id, {int? revision}) => _mutate(() async {
    if (revision == null) _checkMutable(id);
    final row = _rows[id];
    if (row == null) return;
    if (revision != null && revision != row.revision) {
      throw const OutboxChanged();
    }
    // Unlink the commit file first, so a crash during cleanup cannot resurrect it.
    await File('${directory.path}/$id/message.json').delete();
    _rows.remove(id);
    progress.remove(id);
    notifyListeners();
    try {
      await Directory('${directory.path}/$id').delete(recursive: true);
    } on FileSystemException {
      /* Orphan bytes can be cleaned after delivery. */
    }
  });

  void useTransport(OutboxTransport transport) {
    _transport = transport;
    wake();
  }

  void wake() {
    if (_closed) return;
    _timer?.cancel();
    if (!_running) unawaited(_drain());
  }

  Future<void> _drain() async {
    if (_running || _closed) return;
    _running = true;
    try {
      await open();
      final transport = _transport;
      if (transport == null) return;
      final lanes = <String>{};
      for (final row in items) {
        if (!transport.matches(row) || !lanes.add(row.lane)) continue;
        if (row.state == 'editing' ||
            row.retryAt > now().millisecondsSinceEpoch) {
          continue;
        }
        await _deliver(row, transport);
      }
    } catch (error) {
      storageError = 'Outbox storage unavailable: $error';
      notifyListeners();
    } finally {
      _running = false;
      if (!_closed) _timer = Timer(const Duration(seconds: 2), wake);
    }
  }

  Future<void> _deliver(OutboxItem initial, OutboxTransport transport) async {
    var row = initial;
    Future<void> save(Map<String, dynamic> changes) async {
      final next = row.patch(changes);
      await _checkpoint(row, next);
      row = next;
    }

    try {
      await save({'state': 'sending', 'error': null});
      if (!transport.matches(row)) return;
      final receipt = await transport.find(row);
      if (receipt.event != null || receipt.deleted) {
        if (receipt.event case final event?) transport.accepted(row, event);
        await remove(row.id, revision: row.revision);
        return;
      }
      // A completed lookup proves none of the locally journaled versions exists.
      await save({'uncertain': false});
      for (var index = 0; index < row.attachments.length; index++) {
        final attachment = row.attachments[index];
        if (attachment['descriptor'] != null) continue;
        final descriptor = await transport.upload(row, attachment, (value) {
          progress[row.id] = (index + value) / row.attachments.length;
          notifyListeners();
        });
        if (!transport.matches(row)) throw const OutboxChanged();
        final attachments = row.attachments
            .map((entry) => Map<String, dynamic>.from(entry))
            .toList();
        attachments[index]['descriptor'] = {
          'url': descriptor.url,
          'sha256': descriptor.sha256,
          'size': descriptor.size,
          'type': descriptor.type,
          'uploaded': descriptor.uploaded,
          'dim': descriptor.dim,
          'blurhash': descriptor.blurhash,
          'thumb': descriptor.thumb,
          'duration': descriptor.duration,
          'image': descriptor.image,
          'filename': descriptor.filename,
        };
        await save({'attachments': attachments});
      }
      final signed = row.signed;
      if (signed == null ||
          now().millisecondsSinceEpoch ~/ 1000 - signed.createdAt > 900) {
        final event = await transport.prepare(row);
        if (!transport.matches(row)) throw const OutboxChanged();
        await save({
          'signed': event.toJson(),
          'signedIds': {...row.signedIds, event.id}.toList(),
        });
      }
      if (!transport.matches(row)) throw const OutboxChanged();
      await save({
        'uncertain': true,
      }); // Journal before any possible publication.
      await _mutate(() async {
        if (_rows[row.id]?.revision != row.revision ||
            !transport.matches(row)) {
          throw const OutboxChanged();
        }
        publishing.add(row.id);
        notifyListeners();
      });
      await transport.publish(row);
      transport.accepted(row, row.signed!);
      await remove(row.id, revision: row.revision);
    } on OutboxChanged {
      // User action or a captured-context change superseded this worker snapshot.
    } catch (error) {
      final attempts = (row.data['attempts'] as int) + 1;
      final delay = min(300000, 1000 * pow(2, min(attempts, 8)).toInt());
      try {
        await save({
          'state': 'waiting',
          'error': error.toString(),
          'attempts': attempts,
          'retryAt':
              now().millisecondsSinceEpoch +
              (delay * (0.8 + jitter() * 0.4)).toInt(),
        });
      } on OutboxChanged {
        /* A newer user action owns the record. */
      }
    } finally {
      progress.remove(row.id);
      publishing.remove(row.id);
      notifyListeners();
    }
  }

  /// Wait for owned I/O before releasing the process lock on orderly shutdown.
  Future<void> close() async {
    _closed = true;
    _timer?.cancel();
    while (_running) {
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
    await _serial;
    await _lock?.close();
    _lock = null;
  }
}

class OutboxChanged implements Exception {
  const OutboxChanged();
}

/// Protect source files while the owning composer can disappear during copying.
/// Counts allow several captured operations to reference the same original.
class OutboxFileLease {
  static final Map<String, int> _counts = {};
  final List<String> paths;
  bool _released = false;
  OutboxFileLease(Iterable<XFile> files)
    : paths = files.map((file) => file.path).toList() {
    for (final path in paths) {
      _counts[path] = (_counts[path] ?? 0) + 1;
    }
  }
  static bool owns(String path) => (_counts[path] ?? 0) > 0;
  void release() {
    if (_released) return;
    _released = true;
    for (final path in paths) {
      final next = (_counts[path] ?? 1) - 1;
      if (next == 0) {
        _counts.remove(path);
      } else {
        _counts[path] = next;
      }
    }
  }
}

/// An unmounted editor cannot restore a failed handoff. Keep its cleanup lease
/// and retry the immutable capture instead; successful commit retires its draft.
Future<void> recoverDetachedOutboxCapture({
  required Future<void> Function() commit,
  required Future<void> Function() committed,
}) async {
  var attempt = 0;
  while (true) {
    await Future<void>.delayed(
      Duration(seconds: min(60, 1 << min(attempt++, 6))),
    );
    try {
      await commit();
    } catch (_) {
      continue;
    }
    await committed();
    return;
  }
}

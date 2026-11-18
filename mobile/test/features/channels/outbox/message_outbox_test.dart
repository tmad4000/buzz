import 'dart:async';
import 'dart:io';

import 'package:buzz/features/channels/outbox/message_outbox.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

Future<void> until(bool Function() ready) async {
  final deadline = DateTime.now().add(const Duration(seconds: 8));
  while (!ready()) {
    if (DateTime.now().isAfter(deadline)) fail('Timed out waiting for outbox');
    await Future<void>.delayed(const Duration(milliseconds: 10));
  }
}

Map<String, dynamic> message(
  String text, {
  String channel = 'channel',
  String? parent,
  String? root,
}) => {
  'relay': 'https://relay.example',
  'author': 'author',
  'channelId': channel,
  'parentId': parent,
  'rootId': root,
  'text': text,
  'mentions': <String>[],
  'mediaTags': <List<String>>[],
  'mentionKeys': <String, String>{},
};

class Transport implements OutboxTransport {
  bool online = true;
  bool scope = true;
  bool loseAck = false;
  int signs = 0;
  final List<NostrEvent> published = [];
  final Map<String, NostrEvent> acceptedEvents = {};
  final List<OutboxItem> acceptedRows = [];
  final List<List<int>> uploaded = [];
  Completer<void>? hold;
  Completer<void>? publishHold;
  bool publishStarted = false;
  final Set<String> deleted = {};
  @override
  bool matches(OutboxItem row) => scope;
  @override
  Future<({NostrEvent? event, bool deleted})> find(OutboxItem row) async {
    if (!online) throw StateError('offline');
    return (event: acceptedEvents[row.id], deleted: deleted.contains(row.id));
  }

  @override
  Future<BlobDescriptor> upload(
    OutboxItem row,
    Map<String, dynamic> attachment,
    void Function(double) progress,
  ) async {
    uploaded.add(await File(attachment['path'] as String).readAsBytes());
    progress(.5);
    await hold?.future;
    if (!online) throw StateError('offline upload');
    return const BlobDescriptor(
      url: 'https://relay.example/image.png',
      sha256: 'hash',
      size: 3,
      type: 'image/png',
      uploaded: 1,
    );
  }

  @override
  Future<NostrEvent> prepare(OutboxItem row) async {
    signs++;
    return NostrEvent(
      id: 'signed-$signs',
      pubkey: row.author,
      createdAt: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      kind: 9,
      content: row.text,
      sig: 'signature',
      tags: [
        ['h', row.channelId],
        ['client_msg_id', row.id],
        ['client_written_at', '${row.intendedAt}'],
      ],
    );
  }

  @override
  Future<void> publish(OutboxItem row) async {
    publishStarted = true;
    await publishHold?.future;
    if (!online) throw StateError('offline publish');
    published.add(row.signed!);
    acceptedEvents[row.id] = row.signed!;
    if (loseAck) throw StateError('ack lost');
  }

  @override
  void accepted(OutboxItem row, NostrEvent event) {
    acceptedRows.add(row);
  }
}

void main() {
  late Directory directory;
  final opened = <MessageOutbox>[];
  Future<MessageOutbox> store({DateTime Function()? now}) async {
    final value = MessageOutbox(directory, now: now, jitter: () => .5);
    opened.add(value);
    await value.open();
    return value;
  }

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('buzz-outbox-test-');
  });
  tearDown(() async {
    for (final value in opened) {
      await value.close();
    }
    opened.clear();
    await directory.delete(recursive: true);
  });

  test(
    'preflight sees a durable paused capture and Retry cannot bypass consent',
    () async {
      var queue = await store();
      final original = await File(
        '${directory.path}/camera.png',
      ).writeAsBytes([4, 5, 6]);
      final entered = Completer<void>();
      final decision = Completer<Map<String, dynamic>?>();
      final pending = queue.enqueue(
        message('caption', parent: 'parent', root: 'root'),
        [OutboxAttachment(XFile(original.path), 'image')],
        prepare: () async {
          entered.complete();
          return decision.future;
        },
      );
      final result = expectLater(pending, throwsA(isA<OutboxNeedsReview>()));
      await entered.future;
      final capture = queue.items.single;
      expect(capture.state, 'editing');
      expect(capture.data['needsReview'], isTrue);
      expect(
        await File(capture.attachments.single['path'] as String).readAsBytes(),
        [4, 5, 6],
      );
      expect(
        await File('${directory.path}/${capture.id}/message.json').exists(),
        isTrue,
      );
      await expectLater(queue.retry(capture.id), throwsStateError);
      // Navigation cancels the UI preflight; its own original may now disappear.
      await original.delete();
      decision.complete(null);
      await result;
      await queue.close();
      queue = await store();
      expect(queue.items.single.text, 'caption');
      expect(queue.items.single.parentId, 'parent');
      expect(queue.items.single.rootId, 'root');
      expect(queue.items.single.data['needsReview'], isTrue);
      await expectLater(queue.retry(capture.id), throwsStateError);
      final paused = await queue.pause(capture.id);
      await queue.edit(
        paused,
        {'text': 'reviewed caption'},
        [],
        prepare: () async => {
          'mentions': <String>[],
          'mediaTags': <List<String>>[],
          'mentionKeys': <String, String>{},
        },
      );
      expect(queue.items.single.data['needsReview'], isFalse);
      expect(queue.items.single.state, 'waiting');
      expect(queue.items.single.text, 'reviewed caption');
    },
  );

  test(
    'preflight exception retains its original capture without publishing',
    () async {
      final queue = await store();
      final transport = Transport();
      queue.useTransport(transport);
      await expectLater(
        queue.enqueue(
          message('retain after check failure'),
          [],
          prepare: () async => throw StateError('membership unavailable'),
        ),
        throwsA(isA<OutboxNeedsReview>()),
      );
      expect(queue.items.single.data['needsReview'], isTrue);
      expect(transport.published, isEmpty);
      await expectLater(queue.retry(queue.items.single.id), throwsStateError);
    },
  );

  test(
    'raw bytes and text survive closing and reopening independently of source file',
    () async {
      final original = File('${directory.path}/source.png');
      await original.writeAsBytes([1, 2, 3]);
      var queue = await store();
      final row = await queue.enqueue(
        message('caption', parent: 'nested', root: 'root'),
        [OutboxAttachment(XFile(original.path), 'image')],
      );
      await original.delete();
      await queue.close();
      queue = await store();
      final restored = queue.items.single;
      expect(restored.id, row.id);
      expect(restored.text, 'caption');
      expect(restored.parentId, 'nested');
      expect(restored.rootId, 'root');
      expect(
        await File(restored.attachments.single['path'] as String).readAsBytes(),
        [1, 2, 3],
      );
      final transport = Transport();
      queue.useTransport(transport);
      await until(() => queue.items.isEmpty);
      expect(transport.uploaded, [
        [1, 2, 3],
      ]);
    },
  );

  test(
    'offline restart then reconnect preserves queue and conversation order',
    () async {
      var queue = await store();
      final transport = Transport()..online = false;
      await queue.enqueue(message('first'), []);
      await queue.enqueue(message('second'), []);
      queue.useTransport(transport);
      await until(() => queue.items.first.error != null);
      expect(transport.published, isEmpty);
      await queue.close();
      queue = await store();
      transport.online = true;
      queue.useTransport(transport);
      for (final row in queue.items) {
        await queue.retry(row.id);
      }
      await until(() => queue.items.isEmpty);
      expect(transport.published.map((event) => event.content), [
        'first',
        'second',
      ]);
    },
  );

  test(
    'uncertain accepted event survives restart without signing or publishing again',
    () async {
      var queue = await store();
      final transport = Transport()..loseAck = true;
      final row = await queue.enqueue(message('once'), []);
      queue.useTransport(transport);
      await until(() => queue.items.single.error != null);
      expect(queue.items.single.signedIds, ['signed-1']);
      expect(queue.items.single.uncertain, isTrue);
      await expectLater(queue.pause(row.id), throwsStateError);
      await queue.close();
      queue = await store();
      transport.loseAck = false;
      queue.useTransport(transport);
      await queue.retry(row.id);
      await until(() => queue.items.isEmpty);
      expect(transport.signs, 1);
      expect(transport.published, hasLength(1));
    },
  );

  test(
    'checkpointed signature is reused within window after a failed attempt',
    () async {
      final queue = await store();
      final transport = Transport();
      // Fail only publication, after the signing journal is committed.
      transport.loseAck = true;
      final row = await queue.enqueue(message('retry'), []);
      queue.useTransport(transport);
      await until(() => queue.items.single.error != null);
      transport.acceptedEvents.clear();
      transport.loseAck = false;
      await queue.retry(row.id);
      await until(() => queue.items.isEmpty);
      expect(transport.signs, 1);
      expect(transport.published.map((event) => event.id).toSet(), {
        'signed-1',
      });
    },
  );

  test(
    'expired absence re-signs with stable client ID and original written time',
    () async {
      var instant = DateTime.now();
      final queue = await store(now: () => instant);
      final transport = Transport()..loseAck = true;
      final row = await queue.enqueue(
        message('long offline', parent: 'parent', root: 'root'),
        [],
      );
      queue.useTransport(transport);
      await until(() => queue.items.single.error != null);
      transport.acceptedEvents.clear();
      transport.loseAck = false;
      instant = instant.add(const Duration(hours: 2));
      await queue.retry(row.id);
      await until(() => queue.items.isEmpty);
      expect(transport.signs, 2);
      expect(
        transport.published
            .map((event) => event.getTagValue('client_msg_id'))
            .toSet(),
        {row.id},
      );
      expect(
        transport.published
            .map((event) => event.getTagValue('client_written_at'))
            .toSet(),
        {'${row.intendedAt}'},
      );
      expect(transport.acceptedRows.single.signedIds, ['signed-1', 'signed-2']);
      expect(transport.acceptedRows.single.parentId, 'parent');
    },
  );

  test(
    'known deletion receipt retires without resurrecting expired content',
    () async {
      final queue = await store();
      final transport = Transport();
      final row = await queue.enqueue(message('deleted elsewhere'), []);
      transport.deleted.add(row.id);
      queue.useTransport(transport);
      await until(() => queue.items.isEmpty);
      expect(transport.published, isEmpty);
      expect(transport.signs, 0);
    },
  );

  test(
    'edit supersedes an active upload and preserves destination and bytes',
    () async {
      final original = await File(
        '${directory.path}/source.png',
      ).writeAsBytes([4, 5, 6]);
      final queue = await store();
      final transport = Transport()..hold = Completer<void>();
      final row = await queue.enqueue(
        message('old', parent: 'parent', root: 'root'),
        [OutboxAttachment(XFile(original.path), 'image')],
      );
      queue.useTransport(transport);
      await until(() => transport.uploaded.isNotEmpty);
      final paused = await queue.pause(row.id);
      await queue.edit(
        paused,
        {'text': 'edited', 'mentions': <String>[]},
        [
          OutboxAttachment(
            XFile(paused.attachments.single['path'] as String),
            'image',
          ),
        ],
      );
      transport.hold!.complete();
      transport.hold = null;
      await until(() => queue.items.isEmpty);
      expect(transport.published.single.content, 'edited');
      expect(transport.acceptedRows.single.parentId, 'parent');
      expect(
        transport.uploaded.every((bytes) => bytes.join() == '456'),
        isTrue,
      );
    },
  );

  test('Delete while upload is pending prevents later publication', () async {
    final original = await File(
      '${directory.path}/source.png',
    ).writeAsBytes([7]);
    final queue = await store();
    final transport = Transport()..hold = Completer<void>();
    final row = await queue.enqueue(message('delete me'), [
      OutboxAttachment(XFile(original.path), 'image'),
    ]);
    queue.useTransport(transport);
    await until(() => transport.uploaded.isNotEmpty);
    await queue.remove(row.id);
    transport.hold!.complete();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    expect(transport.published, isEmpty);
    expect(queue.items, isEmpty);
    await queue.close();
    final reopened = await store();
    expect(reopened.items, isEmpty);
  });

  test(
    'captured context switch never publishes via another account or relay',
    () async {
      final queue = await store();
      final transport = Transport()..scope = false;
      await queue.enqueue(message('scoped'), []);
      queue.useTransport(transport);
      await Future<void>.delayed(const Duration(milliseconds: 100));
      expect(transport.signs, 0);
      expect(queue.items.single.text, 'scoped');
      transport.scope = true;
      queue.wake();
      await until(() => queue.items.isEmpty);
      expect(transport.published.single.pubkey, 'author');
    },
  );
  test(
    'publication claim keeps journal and blocks Delete Retry Edit until outcome',
    () async {
      final queue = await store();
      final transport = Transport()..publishHold = Completer<void>();
      final row = await queue.enqueue(message('claimed'), []);
      queue.useTransport(transport);
      await until(() => transport.publishStarted);
      await expectLater(queue.remove(row.id), throwsStateError);
      await expectLater(queue.retry(row.id), throwsStateError);
      await expectLater(queue.pause(row.id), throwsStateError);
      expect(queue.items.single.signedIds, ['signed-1']);
      transport.publishHold!.complete();
      await until(() => queue.items.isEmpty);
      expect(transport.published, hasLength(1));
    },
  );

  test(
    'reference-counted source leases protect bytes across detached handoff',
    () async {
      final source = await File(
        '${directory.path}/owned.png',
      ).writeAsBytes([1, 2, 3]);
      final first = OutboxFileLease([XFile(source.path)]);
      final second = OutboxFileLease([XFile(source.path)]);
      expect(OutboxFileLease.owns(source.path), isTrue);
      first.release();
      expect(OutboxFileLease.owns(source.path), isTrue);
      second.release();
      expect(OutboxFileLease.owns(source.path), isFalse);
    },
  );
}

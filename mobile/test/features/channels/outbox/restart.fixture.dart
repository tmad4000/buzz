// Invoked explicitly by scripts/test-outbox-process-restart.py, not the normal
// test glob. It exercises the production disk queue in a killed Flutter VM.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:buzz/features/channels/outbox/message_outbox.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';

import 'message_outbox_test.dart' as support;

void main() {
  test('process restart fixture', () async {
    final root = Platform.environment['BUZZ_OUTBOX_RESTART_ROOT'];
    final phase = Platform.environment['BUZZ_OUTBOX_RESTART_PHASE'];
    if (root == null || phase == null) {
      throw StateError('Restart harness environment required');
    }
    final queue = MessageOutbox(Directory('$root/queue'));
    await queue.open();
    final transport = support.Transport();
    if (phase == 'capture') {
      final original = await File(
        '$root/original.png',
      ).writeAsBytes([9, 8, 7, 6]);
      final first = await queue.enqueue(
        support.message('image caption', parent: 'nested', root: 'root'),
        [OutboxAttachment(XFile(original.path), 'image')],
      );
      await queue.enqueue(
        support.message('queued text', parent: 'nested', root: 'root'),
        [],
      );
      await original.delete();
      transport.hold = Completer<void>();
      queue.useTransport(transport);
      await support.until(() => transport.uploaded.isNotEmpty);
      await File(
        '$root/ready.json',
      ).writeAsString(jsonEncode({'pid': pid, 'id': first.id}), flush: true);
      await Completer<void>().future; // Parent sends SIGKILL at mid-upload.
    } else {
      expect(queue.items.map((row) => row.text), [
        'image caption',
        'queued text',
      ]);
      expect(queue.items.first.parentId, 'nested');
      expect(queue.items.first.rootId, 'root');
      queue.useTransport(transport);
      await support.until(() => queue.items.isEmpty);
      expect(transport.uploaded, [
        [9, 8, 7, 6],
      ]);
      expect(transport.published.map((event) => event.content), [
        'image caption',
        'queued text',
      ]);
      await File('$root/recovered.json').writeAsString(
        jsonEncode({
          'originalBytes': transport.uploaded.single,
          'fifo': transport.published.map((event) => event.content).toList(),
          'capturedThread': transport.acceptedRows.every(
            (row) => row.parentId == 'nested' && row.rootId == 'root',
          ),
        }),
        flush: true,
      );
      await queue.close();
    }
  }, timeout: const Timeout(Duration(minutes: 2)));
}

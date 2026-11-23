import 'package:flutter_test/flutter_test.dart';
import 'package:buzz/features/channels/reply_view.dart';
import 'package:buzz/features/channels/timeline_message.dart';

TimelineMessage _message(
  String id,
  int createdAt, {
  String? parent,
  String? root,
  String content = 'text',
}) => TimelineMessage(
  id: id,
  pubkey: 'p',
  createdAt: createdAt,
  content: content,
  parentId: parent,
  rootId: root,
);

void main() {
  final thread = [
    _message('root', 1),
    _message('late', 9, parent: 'root', root: 'root'),
    _message('early', 2, parent: 'root', root: 'root'),
    _message('nested', 5, parent: 'early', root: 'root'),
    _message('orphan', 4, parent: 'missing', root: 'root'),
    _message('elsewhere', 3),
  ];

  test('a flat thread is chronological and keeps orphaned replies', () {
    expect(flatThreadReplies('root', thread).map((m) => m.id), [
      'early',
      'orphan',
      'nested',
      'late',
    ]);
    expect(flatThreadReplies('early', thread).map((m) => m.id), ['nested']);
  });

  test('cyclic parents terminate and equal times tie by ID', () {
    final cyclic = [
      _message('root', 1),
      _message('b', 2, parent: 'a', root: 'root'),
      _message('a', 2, parent: 'b', root: 'root'),
    ];
    expect(flatThreadReplies('root', cyclic).map((m) => m.id), ['a', 'b']);
  });

  test('a flat channel keeps every message once, without summaries', () {
    final entries = buildFlatTimelineEntries(thread);
    expect(entries.map((e) => e.message.id), [
      'root',
      'early',
      'elsewhere',
      'orphan',
      'nested',
      'late',
    ]);
    expect(entries.every((e) => e.summary == null), isTrue);
  });

  test('a reply target round-trips and rejects malformed records', () {
    final target = ReplyTarget.of(
      _message('nested', 5, parent: 'early', root: 'root', content: 'a\n b'),
    );
    final decoded = ReplyTarget.decode(target.encode())!;
    expect(
      (decoded.id, decoded.rootId, decoded.excerpt),
      ('nested', 'root', 'a b'),
    );
    expect(ReplyTarget.of(_message('root', 1)).rootId, 'root');
    expect(
      ReplyTarget.of(_message('m', 1, content: ' ')).excerpt,
      'Attachment',
    );
    for (final raw in [null, '', '[]', '{"id":1}', '{']) {
      expect(ReplyTarget.decode(raw), isNull);
    }
  });
}

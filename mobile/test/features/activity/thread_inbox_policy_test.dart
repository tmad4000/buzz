import 'package:buzz/features/activity/thread_inbox_policy.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';

String id(int n) => n.toRadixString(16).padLeft(64, '0');
final me = 'a' * 64, other = 'b' * 64;
NostrEvent root(
  int n, {
  String channel = 'a',
  int kind = 9,
  List<List<String>>? tags,
}) => NostrEvent(
  id: id(n),
  pubkey: me,
  kind: kind,
  createdAt: 1000,
  tags:
      tags ??
      [
        ['h', channel],
      ],
  content: 'Synthetic root',
  sig: 'not-a-proof',
);
NostrEvent reply(
  int n,
  int rootId, {
  String channel = 'a',
  int kind = 9,
  String? author,
  List<List<String>>? tags,
}) => NostrEvent(
  id: id(n),
  pubkey: author ?? other,
  kind: kind,
  createdAt: 1001,
  tags:
      tags ??
      [
        ['h', channel],
        ['e', id(rootId), '', 'reply'],
      ],
  content: 'Synthetic reply',
  sig: 'not-a-proof',
);

void main() {
  test(
    'existing interest sources union by identity, explicit follows first, malformed IDs excluded',
    () {
      expect(
        inboxInterestRoots(
          followed: {id(2), 'invalid'},
          participated: {id(1), id(2)},
          authored: {id(1), id(3)},
        ),
        [id(2), id(1), id(3)],
      );
    },
  );
  test(
    'root lookup binds only exact requested native topics in one current-member channel',
    () {
      final rows = [
        root(1),
        root(2, kind: 45001),
        root(3, kind: 40002),
        root(4, channel: 'unjoined'),
        root(5, kind: 40003),
        root(
          6,
          tags: [
            ['h', 'a'],
            ['h', 'b'],
          ],
        ),
        root(
          7,
          tags: [
            ['h', 'a'],
            ['e', id(1), '', 'reply'],
          ],
        ),
        root(99),
      ];
      final bindings = bindInboxRoots(
        rows,
        {for (var n = 1; n <= 7; n++) id(n)},
        {'a', 'b'},
      );
      expect(bindings.keys, [id(1), id(2), id(3)]);
    },
  );
  test(
    'conflicting root channels fail closed while identical root duplicates deduplicate',
    () {
      expect(
        bindInboxRoots([root(1), root(1, channel: 'b')], {id(1)}, {'a', 'b'}),
        isEmpty,
      );
      expect(bindInboxRoots([root(1), root(1)], {id(1)}, {'a'}), hasLength(1));
    },
  );
  test(
    'chat, diff and forum replies retain native kind and canonical direct or nested root',
    () {
      final bindings = bindInboxRoots(
        [root(1), root(2, kind: 45001), root(3, kind: 40002)],
        {id(1), id(2), id(3)},
        {'a'},
      );
      for (final pair in [
        (1, 9, true),
        (1, 40002, true),
        (1, 45003, false),
        (2, 45003, true),
        (2, 9, false),
        (3, 9, true),
      ]) {
        expect(
          isInboxThreadReply(reply(20, pair.$1, kind: pair.$2), bindings, me, {
            'a',
          }),
          pair.$3,
        );
      }
      expect(
        isInboxThreadReply(
          reply(
            20,
            1,
            tags: [
              ['h', 'a'],
              ['e', id(1), '', 'root'],
              ['e', id(10), '', 'reply'],
            ],
          ),
          bindings,
          me,
          {'a'},
        ),
        isTrue,
      );
    },
  );
  test(
    'reply policy rejects wrong or multiple h, unrelated roots, own replies and ambiguous ancestry',
    () {
      final bindings = bindInboxRoots([root(1)], {id(1)}, {'a', 'b'});
      final rows = [
        reply(20, 1, channel: 'b'),
        reply(20, 2),
        reply(20, 1, author: me.toUpperCase()),
        reply(20, 1, kind: 40003),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['h', 'a'],
            ['e', id(1), '', 'reply'],
          ],
        ),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['h'],
            ['e', id(1), '', 'reply'],
          ],
        ),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['e', id(1), '', 'root'],
          ],
        ),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['e', id(1), '', 'reply'],
            ['e', id(2), '', 'reply'],
          ],
        ),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['e', id(1), '', 'root'],
            ['e', id(2), '', 'root'],
            ['e', id(3), '', 'reply'],
          ],
        ),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['e', id(2), '', 'root'],
            ['e', id(1), '', 'reply'],
          ],
        ),
        reply(
          20,
          1,
          tags: [
            ['h', 'a'],
            ['e', id(1), '', 'root'],
            ['e', id(20), '', 'reply'],
          ],
        ),
      ];
      for (final row in rows) {
        expect(isInboxThreadReply(row, bindings, me, {'a', 'b'}), isFalse);
      }
      expect(isInboxThreadReply(reply(20, 1), bindings, me, {}), isFalse);
    },
  );
  test(
    'a multi-channel h/e cross-product never widens the actual per-root channel',
    () {
      final bindings = bindInboxRoots(
        [root(1), root(2, channel: 'b')],
        {id(1), id(2)},
        {'a', 'b'},
      );
      expect(
        isInboxThreadReply(reply(20, 1, channel: 'b'), bindings, me, {
          'a',
          'b',
        }),
        isFalse,
      );
      expect(
        isInboxThreadReply(reply(20, 2, channel: 'b'), bindings, me, {
          'a',
          'b',
        }),
        isTrue,
      );
    },
  );
  test(
    'nonempty batches obey literal root, h and read caps and pair exact h with e',
    () {
      final bindings = {
        for (var n = 1; n <= 27; n++)
          id(n): ThreadRootBinding(id(n), 'channel-$n', 9),
      };
      final batches = inboxReplyBatches(bindings);
      expect(batches, hasLength(3));
      for (final batch in batches) {
        expect(batch.length, lessThanOrEqualTo(10));
        final filter = inboxReplyFilter(batch);
        expect(filter.limit, 50);
        expect(filter.tags['#h']!.length, lessThanOrEqualTo(10));
        expect(filter.tags['#e'], batch.keys.toList());
        expect(
          filter.tags['#h']!.toSet(),
          batch.values.map((binding) => binding.channelId).toSet(),
        );
      }
      expect(() => inboxReplyFilter({}), throwsArgumentError);
      expect(() => inboxReplyFilter(bindings), throwsArgumentError);
    },
  );
}

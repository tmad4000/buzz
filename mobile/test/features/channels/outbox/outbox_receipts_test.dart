import 'package:buzz/features/channels/outbox/outbox_provider.dart';
import 'package:buzz/features/channels/outbox/deletion_receipt.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostr/nostr.dart' as nostr;

void main() {
  final key = nostr.Keys.generate();
  final foreign = nostr.Keys.generate();
  test('only verified owner-scoped deletion can retire an outbox capture', () {
    NostrEvent receipt(int kind, String secret, List<List<String>> tags) =>
        NostrEvent.fromJson(
          nostr.Event.from(
            kind: kind,
            content: '',
            tags: tags,
            secretKey: secret,
            verify: false,
          ).toMap(),
        );
    final target = 'ab' * 32;
    final owner = receipt(5, key.secret, [
      ['e', target],
    ]).pubkey;
    OutboxDeletion admit(NostrEvent event) => verifiedOutboxDeletion(
      event,
      owner: owner,
      channel: 'channel',
      signedIds: {target},
    );
    expect(
      admit(
        receipt(5, key.secret, [
          ['e', target],
        ]),
      ),
      OutboxDeletion.owner,
    );
    expect(
      admit(
        receipt(9005, key.secret, [
          ['e', target],
          ['h', 'channel'],
        ]),
      ),
      OutboxDeletion.owner,
    );
    expect(
      admit(
        receipt(5, foreign.secret, [
          ['e', target],
        ]),
      ),
      OutboxDeletion.unrelated,
    );
    expect(
      admit(
        receipt(9005, foreign.secret, [
          ['e', target],
          ['h', 'channel'],
        ]),
      ),
      OutboxDeletion.authorityUnknown,
    );
    for (final tags in [
      [
        ['e', 'cd' * 32],
      ],
      [
        ['e', target],
        ['h', 'wrong'],
      ],
      [
        ['e', target],
        ['h', 'channel'],
        ['h', 'channel'],
      ],
    ]) {
      expect(admit(receipt(5, key.secret, tags)), OutboxDeletion.unrelated);
    }
    expect(
      admit(
        receipt(9005, key.secret, [
          ['e', target],
        ]),
      ),
      OutboxDeletion.unrelated,
    );
    final valid = receipt(5, key.secret, [
      ['e', target],
    ]);
    expect(
      () =>
          admit(NostrEvent.fromJson({...valid.toJson(), 'content': 'forged'})),
      throwsFormatException,
    );
  });
  NostrEvent signed(int kind) => NostrEvent.fromJson(
    nostr.Event.from(
      kind: kind,
      content: 'original',
      tags: [
        ['h', 'channel'],
        ['client_msg_id', 'stable-id'],
      ],
      secretKey: key.secret,
      verify: false,
    ).toMap(),
  );
  for (final kind in [9, 5, 9005]) {
    test(
      'kind $kind valid receipt is accepted and corrupted evidence throws',
      () {
        final event = signed(kind);
        verifyOutboxReceipt(event);
        final corrupted = NostrEvent.fromJson({
          ...event.toJson(),
          'content': 'tampered',
        });
        expect(() => verifyOutboxReceipt(corrupted), throwsFormatException);
      },
    );
  }
}

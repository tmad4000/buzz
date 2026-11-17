import 'package:buzz/features/channels/outbox/outbox_provider.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nostr/nostr.dart' as nostr;

void main() {
  final key = nostr.Keys.generate();
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

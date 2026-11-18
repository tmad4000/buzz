import 'package:flutter_test/flutter_test.dart';
import 'package:buzz/shared/offline/offline_head.dart';
import 'package:buzz/shared/relay/relay.dart';

NostrEvent aux(String id, int kind, List<String> targets) => NostrEvent(
  id: id,
  pubkey: 'alice',
  createdAt: 1,
  kind: kind,
  tags: [
    for (final target in targets) ['e', target],
  ],
  content: 'body',
  sig: '',
);
void main() {
  test(
    'head closure keeps deletion of an edit but excludes unopened reply edits/reactions',
    () {
      final result = offlineHeadAux(
        [
          aux('delete-edit', EventKind.deletion, ['edit']),
          aux('edit', EventKind.streamMessageEdit, ['root']),
          aux('unopened-edit', EventKind.streamMessageEdit, ['reply']),
          aux('unopened-reaction', EventKind.reaction, ['root', 'reply']),
        ],
        {'root'},
      );
      expect(result.map((event) => event.id).toSet(), {'edit', 'delete-edit'});
    },
  );
}

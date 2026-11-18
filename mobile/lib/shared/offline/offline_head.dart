import '../relay/relay.dart';

/// Only the selected roots' aux closure belongs in a head-only snapshot.
List<NostrEvent> offlineHeadAux(
  Iterable<NostrEvent> events,
  Set<String> roots,
) {
  final ids = {...roots};
  final result = <String, NostrEvent>{};
  var changed = true;
  while (changed) {
    changed = false;
    for (final event in events) {
      if (result.containsKey(event.id)) continue;
      final targets = event.tags
          .where((tag) => tag.length > 1 && tag[0] == 'e')
          .map((tag) => tag[1])
          .toList();
      final selected =
          event.kind == EventKind.deletion ||
              event.kind == EventKind.nip29DeleteEvent
          ? targets.any(ids.contains)
          : (event.kind == EventKind.reaction ||
                    event.kind == EventKind.streamMessageEdit) &&
                targets.isNotEmpty &&
                ids.contains(targets.last);
      if (selected) {
        result[event.id] = event;
        ids.add(event.id);
        changed = true;
      }
    }
  }
  return result.values.toList();
}

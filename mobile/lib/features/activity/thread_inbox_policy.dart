import '../../shared/relay/relay.dart';

const threadInboxRootPageSize = 20;
const threadInboxMaxRoots = 100;
const threadInboxBatchRoots = 10;
const threadInboxReplyLimit = 50;
const threadInboxMaxEvents = 500;
const threadInboxReadConcurrency = 2;
const threadInboxRootKinds = [9, 40002, 45001];
const threadInboxReplyKinds = [9, 40002, 45003];
final _eventId = RegExp(r'^[0-9a-f]{64}$');

List<String> inboxInterestRoots({
  required Set<String> followed,
  required Set<String> participated,
  required Set<String> authored,
}) {
  final ordered = <String>[];
  final seen = <String>{};
  for (final source in [followed, participated, authored]) {
    for (final id in source.toList()..sort()) {
      if (_eventId.hasMatch(id) && seen.add(id)) ordered.add(id);
    }
  }
  return List.unmodifiable(ordered);
}

class ThreadRootBinding {
  const ThreadRootBinding(this.rootId, this.channelId, this.kind);
  final String rootId;
  final String channelId;
  final int kind;
}

String? singleInboxChannel(NostrEvent event) {
  final tags = event.tags
      .where((tag) => tag.isNotEmpty && tag[0] == 'h')
      .toList();
  if (tags.length != 1 || tags.single.length != 2) return null;
  return tags.single[1];
}

/// Structural binding inside the existing authenticated client trust boundary.
/// The current RelaySession parses inbound events; this is NOT BIP340 proof.
Map<String, ThreadRootBinding> bindInboxRoots(
  Iterable<NostrEvent> events,
  Set<String> requested,
  Set<String> memberChannels,
) {
  final result = <String, ThreadRootBinding>{};
  final conflicted = <String>{};
  for (final event in events) {
    final channel = singleInboxChannel(event);
    if (!requested.contains(event.id) ||
        !_eventId.hasMatch(event.id) ||
        !threadInboxRootKinds.contains(event.kind) ||
        channel == null ||
        !memberChannels.contains(channel) ||
        event.createdAt < 0 ||
        event.tags.any(
          (tag) =>
              tag.length >= 4 &&
              tag[0] == 'e' &&
              (tag[3] == 'root' || tag[3] == 'reply'),
        )) {
      continue;
    }
    final previous = result[event.id];
    if (previous != null &&
        (previous.channelId != channel || previous.kind != event.kind)) {
      conflicted.add(event.id);
    }
    result[event.id] = ThreadRootBinding(event.id, channel, event.kind);
  }
  for (final id in conflicted) {
    result.remove(id);
  }
  return result;
}

bool isInboxThreadReply(
  NostrEvent event,
  Map<String, ThreadRootBinding> bindings,
  String pubkey,
  Set<String> memberChannels,
) {
  final channel = singleInboxChannel(event);
  if (!_eventId.hasMatch(event.id) ||
      event.createdAt < 0 ||
      event.pubkey.toLowerCase() == pubkey.toLowerCase() ||
      channel == null ||
      !memberChannels.contains(channel) ||
      !threadInboxReplyKinds.contains(event.kind)) {
    return false;
  }
  final roots = event.tags
      .where((tag) => tag.length >= 4 && tag[0] == 'e' && tag[3] == 'root')
      .toList();
  final parents = event.tags
      .where((tag) => tag.length >= 4 && tag[0] == 'e' && tag[3] == 'reply')
      .toList();
  if (roots.length > 1 || parents.length != 1) return false;
  final rootId = roots.isEmpty ? parents.single[1] : roots.single[1];
  final binding = bindings[rootId];
  if (binding == null ||
      binding.channelId != channel ||
      event.id == rootId ||
      parents.single[1] == event.id ||
      !_eventId.hasMatch(parents.single[1])) {
    return false;
  }
  return binding.kind == 45001 ? event.kind == 45003 : event.kind != 45003;
}

List<Map<String, ThreadRootBinding>> inboxReplyBatches(
  Map<String, ThreadRootBinding> bindings,
) {
  final values = bindings.values.toList();
  return [
    for (var start = 0; start < values.length; start += threadInboxBatchRoots)
      {
        for (final binding in values.skip(start).take(threadInboxBatchRoots))
          binding.rootId: binding,
      },
  ];
}

NostrFilter inboxReplyFilter(
  Map<String, ThreadRootBinding> batch, {
  int? since,
}) {
  if (batch.isEmpty ||
      batch.length > threadInboxBatchRoots ||
      batch.entries.any((entry) => entry.key != entry.value.rootId)) {
    throw ArgumentError(
      'Tracked reply filters require a bounded root binding batch',
    );
  }
  return NostrFilter(
    kinds: threadInboxReplyKinds,
    tags: {
      '#h': batch.values.map((binding) => binding.channelId).toSet().toList()
        ..sort(),
      '#e': batch.keys.toList(),
    },
    limit: threadInboxReplyLimit,
    since: since,
  );
}

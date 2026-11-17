part of 'channels_provider.dart';

/// Derived read-only view of the existing stores; never a second persisted
/// model or a statement about current channel access.
@immutable
class ThreadInterestSnapshot {
  final String? pubkey;
  final Set<String> authored;
  final Set<String> participated;

  ThreadInterestSnapshot({
    required this.pubkey,
    required Set<String> authored,
    required Set<String> participated,
  }) : authored = Set.unmodifiable(authored),
       participated = Set.unmodifiable(participated);

  @override
  bool operator ==(Object other) =>
      other is ThreadInterestSnapshot &&
      other.pubkey == pubkey &&
      setEquals(other.authored, authored) &&
      setEquals(other.participated, participated);
  @override
  int get hashCode => Object.hash(
    pubkey,
    Object.hashAllUnordered(authored),
    Object.hashAllUnordered(participated),
  );
}

extension ChannelThreadInterests on ChannelsNotifier {
  ThreadInterestSnapshot get threadInterestSnapshot {
    final pubkey = _threadInterestPubkey;
    if (pubkey == null || pubkey.isEmpty) {
      return ThreadInterestSnapshot(
        pubkey: null,
        authored: const {},
        participated: const {},
      );
    }
    return ThreadInterestSnapshot(
      pubkey: pubkey,
      authored: _authoredRootIds,
      participated: _participatedRootIds,
    );
  }
}

/// Notifier identity/context and explicit invalidation drive this view. Ordinary
/// last-message/unread timestamp updates do not refetch the Inbox source.
final channelThreadInterestProvider = Provider<ThreadInterestSnapshot>((ref) {
  final owner = ref.watch(channelsProvider.notifier);
  ref.watch(relayConfigProvider);
  ref.watch(myPubkeyProvider);
  return owner.threadInterestSnapshot;
});

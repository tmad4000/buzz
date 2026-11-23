import 'dart:convert';

import 'package:characters/characters.dart';
import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/relay/relay.dart';
import '../../shared/theme/theme_provider.dart';
import 'timeline_message.dart';

/// Device-local key for one reply-view choice. Community and account scope it,
/// so nothing carries over an in-place community or account switch.
String replyViewPrefsKey(Ref ref, String name, String id) {
  final config = ref.watch(relayConfigProvider);
  final pubkey = ref.watch(myPubkeyProvider) ?? 'anon';
  return 'buzz.reply-view.v1.$name:${config.baseUrl}:$pubkey:$id';
}

/// A remembered on/off presentation choice; off is the existing default.
class ReplyViewToggle extends Notifier<bool> {
  /// Creates a toggle stored under [name] and [id].
  ReplyViewToggle(this.name, this.id);

  /// Storage namespace of the choice.
  final String name;

  /// Channel or thread the choice belongs to.
  final String id;
  late String _key;

  @override
  bool build() {
    _key = replyViewPrefsKey(ref, name, id);
    return ref.read(savedPrefsProvider).getBool(_key) ?? false;
  }

  /// Switch to [value] and remember it.
  void set(bool value) {
    state = value;
    final prefs = ref.read(savedPrefsProvider);
    value ? prefs.setBool(_key, true) : prefs.remove(_key);
  }
}

/// Whether a channel shows one flat chronological Timeline instead of Threads.
final channelTimelineOrderProvider =
    NotifierProvider.family<ReplyViewToggle, bool, String>(
      (channelId) => ReplyViewToggle('channel-timeline', channelId),
    );

/// Whether one thread, by its head event ID, shows as a single flat list.
final flatThreadProvider =
    NotifierProvider.family<ReplyViewToggle, bool, String>(
      (threadHeadId) => ReplyViewToggle('flat-thread', threadHeadId),
    );

/// The message an in-place reply will answer.
@immutable
class ReplyTarget {
  /// Creates a reply target.
  const ReplyTarget({
    required this.id,
    required this.rootId,
    required this.pubkey,
    required this.excerpt,
  });

  /// Captures [message] with its canonical thread root.
  factory ReplyTarget.of(TimelineMessage message) => ReplyTarget(
    id: message.id,
    rootId: message.rootId ?? message.id,
    pubkey: message.pubkey,
    excerpt: quoteExcerpt(message),
  );

  /// Event ID of the direct parent.
  final String id;

  /// Event ID of the thread root.
  final String rootId;

  /// Author of the quoted message.
  final String pubkey;

  /// One-line quoted text.
  final String excerpt;

  /// Serialized form kept beside the composer draft.
  String encode() =>
      jsonEncode({'id': id, 'root': rootId, 'pubkey': pubkey, 'text': excerpt});

  /// Parses [raw], returning null for a missing or malformed record.
  static ReplyTarget? decode(String? raw) {
    if (raw == null) return null;
    try {
      final json = jsonDecode(raw);
      if (json is! Map) return null;
      final (id, root, pubkey, text) = (
        json['id'],
        json['root'],
        json['pubkey'],
        json['text'],
      );
      if (id is! String ||
          root is! String ||
          pubkey is! String ||
          text is! String) {
        return null;
      }
      return ReplyTarget(id: id, rootId: root, pubkey: pubkey, excerpt: text);
    } on FormatException {
      return null;
    }
  }
}

/// One-line quote text for [message].
String quoteExcerpt(TimelineMessage message) {
  final text = message.content.replaceAll(RegExp(r'\s+'), ' ').trim();
  if (text.isEmpty) return 'Attachment';
  return text.characters.take(200).toString();
}

/// Holds one composer's in-place reply target beside its saved draft, so
/// leaving and returning cannot turn a drafted reply into a top-level message.
class ReplyTargetNotifier extends Notifier<ReplyTarget?> {
  /// Creates a target holder for the composer [draftKey].
  ReplyTargetNotifier(this.draftKey);

  /// The composer's existing draft key.
  final String draftKey;
  late String _key;

  @override
  ReplyTarget? build() {
    _key = replyViewPrefsKey(ref, 'reply-target', draftKey);
    return ReplyTarget.decode(ref.read(savedPrefsProvider).getString(_key));
  }

  /// Replace the target, or clear it with null.
  void set(ReplyTarget? target) {
    state = target;
    final prefs = ref.read(savedPrefsProvider);
    target == null
        ? prefs.remove(_key)
        : prefs.setString(_key, target.encode());
  }

  /// Sends with [target] cleared, restoring it if [send] fails before the user
  /// has chosen another one.
  Future<void> sendWith(
    ReplyTarget target,
    Future<void> Function() send,
  ) async {
    set(null);
    try {
      await send();
    } catch (_) {
      if (ref.mounted && state == null) set(target);
      rethrow;
    }
  }
}

/// In-place reply target per composer draft key.
final replyTargetProvider =
    NotifierProvider.family<ReplyTargetNotifier, ReplyTarget?, String>(
      ReplyTargetNotifier.new,
    );

int _chronological(TimelineMessage a, TimelineMessage b) {
  final time = a.createdAt.compareTo(b.createdAt);
  return time != 0 ? time : a.id.compareTo(b.id);
}

/// Every message in [messages] as one chronological list with no thread
/// summaries. Presentation only: parent and root references are unchanged.
List<MainTimelineEntry> buildFlatTimelineEntries(
  List<TimelineMessage> messages,
) => [
  for (final message in [...messages]..sort(_chronological))
    MainTimelineEntry(message: message),
];

/// Every loaded reply below [headId], oldest first. A reply whose parent is
/// not loaded still belongs when it names [headId] as its root.
List<TimelineMessage> flatThreadReplies(
  String headId,
  List<TimelineMessage> messages,
) {
  final children = <String, List<TimelineMessage>>{};
  final found = <String, TimelineMessage>{};
  for (final message in messages) {
    final parentId = message.parentId;
    if (parentId != null) (children[parentId] ??= []).add(message);
    if (message.id != headId && message.rootId == headId) {
      found[message.id] = message;
    }
  }
  final queue = [headId, ...found.keys];
  for (var i = 0; i < queue.length; i++) {
    for (final child in children[queue[i]] ?? const <TimelineMessage>[]) {
      if (child.id == headId || found.containsKey(child.id)) continue;
      found[child.id] = child;
      queue.add(child.id);
    }
  }
  return found.values.toList()..sort(_chronological);
}

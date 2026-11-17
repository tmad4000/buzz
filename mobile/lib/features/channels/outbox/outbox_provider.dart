import 'dart:async';
import 'dart:convert';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:path_provider/path_provider.dart';
import 'dart:io';

import '../../../shared/relay/relay.dart';
import '../channel.dart';
import '../channel_messages_provider.dart';
import '../send_message_provider.dart';
import 'message_outbox.dart';

/// Application-owned, independent of any composer/channel lifetime or cache.
final messageOutboxProvider = FutureProvider<MessageOutbox>((ref) async {
  final directory = await getApplicationSupportDirectory();
  final outbox = MessageOutbox(
    Directory('${directory.path}/message-outbox-v1'),
  );
  ref.onDispose(() {
    unawaited(outbox.close());
  });
  await outbox.open();
  void attach() {
    final config = ref.read(relayConfigProvider);
    final signer = SignedEventRelay(
      session: ref.read(relaySessionProvider.notifier),
      nsec: config.nsec,
    );
    if (signer.pubkey == null) return;
    final sender = ref.read(sendMessageProvider);
    final media = ref.read(mediaUploadServiceProvider);
    final session = ref.read(relaySessionProvider.notifier);
    bool current() {
      final active = ref.read(relayConfigProvider);
      return active.baseUrl == config.baseUrl && active.nsec == config.nsec;
    }

    outbox.useTransport(
      _MobileOutboxTransport(
        config: config,
        signer: signer,
        sender: sender,
        media: media,
        session: session,
        current: current,
        accepted: (row, event) {
          if (!current()) return;
          final messages = ref.read(
            channelMessagesProvider(row.channelId).notifier,
          );
          messages.addLocalMessage(event);
          messages.completeLocalMessage(event.id);
        },
      ),
    );
  }

  ref.listen(relayConfigProvider, (_, _) => attach());
  ref.listen(
    relaySessionProvider.select((state) => state.status),
    (_, _) => attach(),
  );
  attach();
  return outbox;
});

/// Capture metadata at enqueue time, never rediscover a destination after awaits.
Map<String, dynamic> outboxMessage({
  required RelayConfig config,
  required String author,
  required Channel channel,
  required String text,
  required List<String> mentions,
  required List<List<String>> mediaTags,
  Map<String, String> mentionKeys = const {},
  String? parentId,
  String? rootId,
}) => {
  'relay': config.baseUrl,
  'author': author,
  'channelId': channel.id,
  'parentId': parentId,
  'rootId': rootId,
  'text': text,
  'mentions': mentions,
  'mediaTags': mediaTags,
  'mentionKeys': mentionKeys,
  'channel': {
    'id': channel.id,
    'name': channel.name,
    'channel_type': channel.channelType,
    'visibility': channel.visibility,
    'description': channel.description,
    'created_by': channel.createdBy,
    'created_at': channel.createdAt.toIso8601String(),
    'member_count': channel.memberCount,
    'participants': channel.participants,
    'participant_pubkeys': channel.participantPubkeys,
    'is_member': channel.isMember,
  },
};

class _MobileOutboxTransport implements OutboxTransport {
  final RelayConfig config;
  final SignedEventRelay signer;
  final SendMessage sender;
  final MediaUploadService media;
  final RelaySessionNotifier session;
  final bool Function() current;
  final void Function(OutboxItem, NostrEvent) onAccepted;
  _MobileOutboxTransport({
    required this.config,
    required this.signer,
    required this.sender,
    required this.media,
    required this.session,
    required this.current,
    required void Function(OutboxItem, NostrEvent) accepted,
  }) : onAccepted = accepted;
  @override
  bool matches(OutboxItem item) =>
      current() && item.relay == config.baseUrl && item.author == signer.pubkey;
  void check(OutboxItem item) {
    if (!matches(item)) throw const OutboxChanged();
  }

  @override
  Future<BlobDescriptor> upload(
    OutboxItem item,
    Map<String, dynamic> attachment,
    void Function(double) progress,
  ) async {
    check(item);
    final file = XFile(
      attachment['path'] as String,
      name: attachment['name'] as String,
    );
    final result = await switch (attachment['kind']) {
      'image' => media.uploadImage(file, onProgress: progress),
      'video' => media.uploadVideo(file, onProgress: progress),
      'voiceNote' => media.uploadVoiceNote(
        file,
        duration: Duration(milliseconds: attachment['durationMs'] as int? ?? 0),
        onProgress: progress,
      ),
      _ => media.uploadFile(file, onProgress: progress),
    };
    check(item);
    return result;
  }

  @override
  Future<NostrEvent> prepare(OutboxItem item) async {
    check(item);
    // Re-sign the exact previously intended body/destination after expiry.
    if (item.signed case final previous?) {
      return signer.sign(
        kind: previous.kind,
        content: previous.content,
        tags: previous.tags,
      );
    }
    var content = item.text;
    final tags = [
      for (final tag in item.data['mediaTags'] as List)
        (tag as List).cast<String>(),
    ];
    for (final attachment in item.attachments) {
      final descriptor = BlobDescriptor.fromJson(
        attachment['descriptor'] as Map<String, dynamic>,
      );
      content += '\n${descriptor.toMarkdownImage()}';
      tags.add(descriptor.toImetaTag());
    }
    final event = await sender.prepare(
      channelId: item.channelId,
      content: content,
      parentEventId: item.parentId,
      rootEventId: item.rootId,
      channel: Channel.fromJson(item.data['channel'] as Map<String, dynamic>),
      mentionPubkeys: (item.data['mentions'] as List).cast<String>(),
      mediaTags: tags,
      clientMessageId: item.id,
      intendedAt: item.intendedAt,
    );
    check(item);
    return event;
  }

  @override
  Future<({NostrEvent? event, bool deleted})> find(OutboxItem item) async {
    check(item);
    final ids = item.signedIds;
    for (var offset = 0; offset < ids.length; offset += 100) {
      final chunk = ids.skip(offset).take(100).toList();
      final events = await session.queryRelay([
        NostrFilter(
          kinds: const [9],
          ids: chunk,
          authors: [item.author],
          tags: {
            '#h': [item.channelId],
          },
          limit: chunk.length,
          extensions: const {'consistency': 'strong'},
        ),
      ]);
      check(item);
      for (final event in events) {
        verifyOutboxReceipt(event);
        if (chunk.contains(event.id) &&
            event.pubkey == item.author &&
            event.kind == 9 &&
            event.channelId == item.channelId &&
            event.getTagValue('client_msg_id') == item.id) {
          return (event: event, deleted: false);
        }
      }
    }
    for (var offset = 0; offset < ids.length; offset += 100) {
      final receipts = await session.queryRelay([
        NostrFilter(
          kinds: const [5, 9005],
          tags: {'#e': ids.skip(offset).take(100).toList()},
          limit: 1,
          extensions: const {'consistency': 'strong'},
        ),
      ]);
      check(item);
      for (final receipt in receipts) {
        verifyOutboxReceipt(receipt);
      }
      if (receipts.any(
        (event) =>
            (event.kind == 5 || event.kind == 9005) &&
            event.tags.any(
              (tag) => tag.length > 1 && tag[0] == 'e' && ids.contains(tag[1]),
            ),
      )) {
        return (event: null, deleted: true);
      }
    }
    return (event: null, deleted: false);
  }

  @override
  Future<void> publish(OutboxItem item) async {
    check(item);
    await signer.publish(item.signed!);
  }

  @override
  void accepted(OutboxItem item, NostrEvent event) => onAccepted(item, event);
}

/// Invalid relay evidence must fail lookup, never authorize replacement signing.
void verifyOutboxReceipt(NostrEvent event) {
  if (!nostr.Event.fromJson(
    jsonEncode(event.toJson()),
    verify: false,
  ).isValid()) {
    throw const FormatException('Unverifiable outbox receipt');
  }
}

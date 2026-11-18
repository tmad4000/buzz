import '../../features/channels/channel.dart';

/// Derived channel-list payload only; no credentials or action state.
Map<String, dynamic> offlineChannelJson(Channel c) => {
  'id': c.id,
  'name': c.name,
  'channel_type': c.channelType,
  'visibility': c.visibility,
  'description': c.description,
  'topic': c.topic,
  'purpose': c.purpose,
  'created_by': c.createdBy,
  'created_at': c.createdAt.toIso8601String(),
  'member_count': c.memberCount,
  'last_message_at': c.lastMessageAt?.toIso8601String(),
  'archived_at': c.archivedAt?.toIso8601String(),
  'participants': c.participants,
  'participant_pubkeys': c.participantPubkeys,
  'is_member': c.isMember,
  'ttl_seconds': c.ttlSeconds,
  'ttl_deadline': c.ttlDeadline?.toIso8601String(),
};

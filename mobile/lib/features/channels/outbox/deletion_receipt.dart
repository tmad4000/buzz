/// Authority of an already signature-verified deletion for captured outbox data.
enum OutboxDeletion { unrelated, owner, authorityUnknown }

/// Signature validity and query filters alone do not confer deletion authority.
/// This client has no trusted moderator key; foreign moderation stays pending.
OutboxDeletion outboxDeletionAuthority({
  required int kind,
  required String author,
  required List<List<String>> tags,
  required String owner,
  required String channel,
  required Set<String> signedIds,
}) {
  if ((kind != 5 && kind != 9005) ||
      !tags.any(
        (tag) => tag.length >= 2 && tag[0] == 'e' && signedIds.contains(tag[1]),
      )) {
    return OutboxDeletion.unrelated;
  }
  final scopes = tags.where((tag) => tag.isNotEmpty && tag[0] == 'h').toList();
  if (scopes.length > 1 ||
      (scopes.isNotEmpty &&
          (scopes.single.length != 2 || scopes.single[1] != channel)) ||
      (kind == 9005 && scopes.isEmpty)) {
    return OutboxDeletion.unrelated;
  }
  if (author == owner) return OutboxDeletion.owner;
  return kind == 9005
      ? OutboxDeletion.authorityUnknown
      : OutboxDeletion.unrelated;
}

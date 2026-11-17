/// Thread reference from NIP-10 tags — desktop's `getThreadReference`.
({String? parentId, String? rootId}) threadReferenceOf(
  List<List<String>> tags,
) {
  List<String>? rootTag;
  List<String>? replyTag;
  for (final tag in tags) {
    if (tag.length >= 4 && tag[0] == 'e') {
      if (tag[3] == 'root') rootTag = tag;
      if (tag[3] == 'reply') replyTag = tag;
    }
  }
  if (replyTag == null) return (parentId: null, rootId: null);
  final parentId = replyTag[1];
  return (parentId: parentId, rootId: rootTag?[1] ?? parentId);
}

/// Broadcast replies surface at the channel top level — desktop's
/// `isBroadcastReply`.
bool isBroadcastReply(List<List<String>> tags) {
  return tags.any(
    (tag) => tag.length >= 2 && tag[0] == 'broadcast' && tag[1] == '1',
  );
}

part of '../thread_detail_page.dart';

void _useThreadReplyReadState(
  WidgetRef ref,
  BuildContext context,
  String channelId,
  String threadHeadId,
  List<TimelineMessage> replies,
) {
  final sourceId = 'thread:$channelId:$threadHeadId';
  final admitted = ref.watch(readAdmissionProvider(sourceId));
  final readState = ref.watch(readStateProvider);
  final visibleReplyReadKey = replies
      .map((reply) => '${reply.id}:${reply.createdAt}')
      .join(',');

  useEffect(() {
    if (!admitted || !readState.isReady || replies.isEmpty) return null;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (ref.read(offlineEnabledProvider) &&
          (!context.mounted ||
              ModalRoute.of(context)?.isCurrent == false ||
              !ref.read(readAdmissionProvider(sourceId))))
        return;
      for (final reply in replies) {
        if (ref.read(offlineEnabledProvider) &&
            (reply.pubkey == ref.read(myPubkeyProvider) ||
                ref
                    .read(pendingLocalMessagesProvider(channelId))
                    .containsKey(reply.id)))
          continue;
        ref
            .read(readStateProvider.notifier)
            .markContextRead(msgContextKey(reply.id), reply.createdAt);
      }
    });
    return null;
  }, [threadHeadId, readState.isReady, visibleReplyReadKey, admitted]);
}

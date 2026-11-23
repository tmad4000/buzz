part of '../channel_detail_page.dart';

/// Adds flat-Timeline gestures and highlight around an ordinary message row.
class _TimelineRow extends StatelessWidget {
  final TimelineMessage message;
  final bool isFlat;
  final bool isHighlighted;
  final ValueChanged<TimelineMessage>? onReply;
  final Widget child;

  const _TimelineRow({
    required this.message,
    required this.isFlat,
    required this.isHighlighted,
    required this.onReply,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    if (!isFlat) return child;
    final reply = onReply;
    return SwipeToReply(
      onReply: reply == null ? null : () => reply(message),
      child: DecoratedBox(
        key: ValueKey('timeline-row-${message.id}'),
        decoration: BoxDecoration(
          color: isHighlighted
              ? context.colors.primary.withValues(alpha: 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(Radii.md),
        ),
        child: child,
      ),
    );
  }
}

/// The quoted parent shown inside a flat-Timeline message.
Widget? _timelineQuote({
  required TimelineMessage message,
  required String channelId,
  required Map<String, TimelineMessage> messagesById,
  required ValueChanged<String> onJump,
}) {
  final parentId = message.parentId;
  if (parentId == null) return null;
  final parent = messagesById[parentId];
  return ReplyQuote(
    key: ValueKey('timeline-quote-${message.id}'),
    channelId: channelId,
    target: parent == null ? null : ReplyTarget.of(parent),
    onTap: () => onJump(parentId),
  );
}

/// A parent outside the loaded Timeline still has its thread to open.
void _openTimelineThread(
  BuildContext context, {
  required TimelineMessage message,
  required List<TimelineMessage> allMessages,
  required String channelId,
  required String? currentPubkey,
  required bool isMember,
  required bool isArchived,
}) {
  final rootId = message.rootId ?? message.parentId ?? message.id;
  final root = allMessages.where((item) => item.id == rootId).firstOrNull;
  Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => ThreadDetailPage(
        threadHead: root ?? message,
        allMessages: allMessages,
        channelId: channelId,
        currentPubkey: currentPubkey,
        isMember: isMember,
        isArchived: isArchived,
        initialMessageId: message.id,
      ),
    ),
  );
}

/// Honest loading and failure state for the flat Timeline's older replies.
class _TimelineRepliesNotice extends StatelessWidget {
  final TimelineReplies replies;
  final VoidCallback onRetry;

  const _TimelineRepliesNotice({required this.replies, required this.onRetry});

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          replies.loading
              ? 'Loading older replies…'
              : 'Some replies couldn’t load',
          style: context.textTheme.labelSmall?.copyWith(
            color: context.colors.onSurfaceVariant,
          ),
        ),
        if (!replies.loading)
          TextButton(onPressed: onRetry, child: const Text('Retry')),
      ],
    ),
  );
}

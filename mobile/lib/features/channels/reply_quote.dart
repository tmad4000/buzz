import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:buzz/shared/theme/buzz_icons.dart';

import '../../shared/theme/theme.dart';
import 'channel_identity_names_provider.dart';
import 'reply_view.dart';

/// A quoted parent: author and one line of text behind an accent bar.
class ReplyQuote extends ConsumerWidget {
  /// Creates a quote of [target], or of an unloaded message when null.
  const ReplyQuote({
    super.key,
    required this.channelId,
    required this.target,
    this.onTap,
  });

  /// Channel used to resolve the author label.
  final String channelId;

  /// Quoted message; null when it is not loaded.
  final ReplyTarget? target;

  /// Reveals the original.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final quoted = target;
    final author = quoted == null
        ? null
        : watchChannelIdentityLabel(ref, channelId, quoted.pubkey);
    final excerpt = quoted?.excerpt ?? 'Message unavailable';
    return Semantics(
      button: onTap != null,
      label: author == null
          ? 'Reply to a message that is not loaded'
          : 'Jump to original from $author: $excerpt',
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(Radii.sm),
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: Grid.xxs,
            vertical: Grid.half,
          ),
          decoration: BoxDecoration(
            border: Border(
              left: BorderSide(color: context.colors.primary, width: 2),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (author != null)
                Text(
                  author,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.textTheme.labelMedium?.copyWith(
                    color: context.colors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              Text(
                excerpt,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.textTheme.bodySmall?.copyWith(
                  color: context.colors.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The quoted parent above a composer, with its cancel control.
class ReplyTargetBar extends StatelessWidget {
  /// Creates a bar for [target].
  const ReplyTargetBar({
    super.key,
    required this.channelId,
    required this.target,
    required this.onCancel,
    this.onTap,
  });

  /// Channel used to resolve the author label.
  final String channelId;

  /// Message being answered.
  final ReplyTarget target;

  /// Clears the target, keeping the draft.
  final VoidCallback onCancel;

  /// Reveals the original.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Material(
    key: const ValueKey('reply-target-bar'),
    color: context.colors.surfaceContainerHigh,
    child: Padding(
      padding: const EdgeInsets.only(left: Grid.gutter),
      child: Row(
        children: [
          Icon(
            BuzzIcons.messageSquareReply,
            size: 18,
            color: context.colors.onSurfaceVariant,
          ),
          const SizedBox(width: Grid.xxs),
          Expanded(
            child: ReplyQuote(
              channelId: channelId,
              target: target,
              onTap: onTap,
            ),
          ),
          IconButton(
            tooltip: 'Cancel reply',
            onPressed: onCancel,
            icon: const Icon(BuzzIcons.x, size: 18),
          ),
        ],
      ),
    ),
  );
}

const _swipeTrigger = 56.0;
const _swipeLimit = 72.0;

/// Drag a message left to reply. The long-press Reply action is the
/// non-gesture equivalent, so this adds no semantics of its own.
class SwipeToReply extends HookWidget {
  /// Wraps [child]; a null [onReply] disables the gesture.
  const SwipeToReply({super.key, required this.onReply, required this.child});

  /// Starts the reply.
  final VoidCallback? onReply;

  /// Message content.
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final offset = useState(0.0);
    final dragging = useRef(false);
    final reply = onReply;
    if (reply == null) return child;

    void end({required bool commit}) {
      if (!dragging.value) return;
      dragging.value = false;
      final triggered = commit && offset.value >= _swipeTrigger;
      offset.value = 0;
      if (triggered) reply();
    }

    return GestureDetector(
      excludeFromSemantics: true,
      onHorizontalDragStart: (_) => dragging.value = true,
      onHorizontalDragUpdate: (details) {
        final before = offset.value;
        final next = (before - details.delta.dx).clamp(0.0, _swipeLimit);
        if (before < _swipeTrigger && next >= _swipeTrigger) {
          HapticFeedback.selectionClick();
        }
        offset.value = next;
      },
      onHorizontalDragEnd: (_) => end(commit: true),
      onHorizontalDragCancel: () => end(commit: false),
      child: Stack(
        alignment: Alignment.centerRight,
        clipBehavior: Clip.none,
        children: [
          if (offset.value > 0)
            Opacity(
              opacity: math.min(1, offset.value / _swipeTrigger),
              child: Icon(
                BuzzIcons.messageSquareReply,
                size: 20,
                color: context.colors.primary,
              ),
            ),
          AnimatedContainer(
            duration: dragging.value || MediaQuery.disableAnimationsOf(context)
                ? Duration.zero
                : const Duration(milliseconds: 160),
            curve: Curves.easeOutCubic,
            transform: Matrix4.translationValues(-offset.value, 0, 0),
            child: child,
          ),
        ],
      ),
    );
  }
}

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import '../../shared/theme/theme.dart';
import 'thread_inbox_provider.dart';
import 'thread_inbox_state.dart';

/// Describes only bounded tracked-thread coverage, never a global unread count.
class ThreadInboxCoverage extends ConsumerWidget {
  const ThreadInboxCoverage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final source = ref.watch(threadInboxProvider);
    if (!source.hasInterest ||
        source.phase == ThreadInboxPhase.ready && !source.loading) {
      return const SizedBox.shrink();
    }
    final text = source.loading
        ? 'Loading tracked thread replies…'
        : source.phase == ThreadInboxPhase.unavailable
        ? 'Tracked thread replies are unavailable.'
        : 'Some tracked thread replies aren’t loaded.';
    return Semantics(
      liveRegion: true,
      child: Padding(
        key: const Key('thread-inbox-coverage'),
        padding: const EdgeInsets.all(Grid.gutter),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(text, style: context.textTheme.bodyMedium),
            if (!source.loading && source.rootCapReached)
              const Text(
                'This view has reached its tracked-thread limit. Open a channel for other replies.',
              ),
            if (!source.loading && source.historyLimited)
              const Text('Open a thread for earlier replies.'),
            Wrap(
              spacing: Grid.half,
              children: [
                if (source.canLoadMore)
                  TextButton(
                    key: const Key('thread-inbox-load-more'),
                    onPressed: () =>
                        ref.read(threadInboxProvider.notifier).loadMore(),
                    child: const Text('Load more threads'),
                  ),
                if (!source.loading &&
                    (source.unavailableRoots ||
                        source.liveUnavailable ||
                        source.phase == ThreadInboxPhase.unavailable))
                  TextButton(
                    key: const Key('thread-inbox-retry'),
                    onPressed: () =>
                        ref.read(threadInboxProvider.notifier).refresh(),
                    child: const Text('Retry thread replies'),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

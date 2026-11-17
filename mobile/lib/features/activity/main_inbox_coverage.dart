import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

import '../../shared/theme/theme.dart';
import 'activity_provider.dart';

/// Main addressed/DM coverage is independent of available tracked-thread rows.
class MainInboxCoverage extends ConsumerWidget {
  const MainInboxCoverage({
    super.key,
    required this.retrying,
    required this.onRetry,
  });
  final bool retrying;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final feed = ref.watch(activityProvider);
    if (!feed.isLoading && !feed.hasError) return const SizedBox.shrink();
    final loading = feed.isLoading || retrying;
    return Semantics(
      liveRegion: true,
      child: Padding(
        key: const Key('main-inbox-coverage'),
        padding: const EdgeInsets.all(Grid.gutter),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              loading
                  ? 'Loading Inbox items…'
                  : 'Some Inbox items couldn’t be loaded.',
              style: context.textTheme.bodyMedium,
            ),
            if (feed.hasError)
              TextButton(
                key: const Key('main-inbox-retry'),
                onPressed: loading ? null : onRetry,
                child: const Text('Retry Inbox items'),
              ),
          ],
        ),
      ),
    );
  }
}

part of '../search_page.dart';

class _MessageSearchError extends StatelessWidget {
  const _MessageSearchError({required this.onRetry, required this.retrying});
  final VoidCallback onRetry;
  final bool retrying;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Padding(
      key: const Key('search-message-error'),
      padding: const EdgeInsets.all(Grid.gutter),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            "Messages couldn't be searched.",
            style: context.textTheme.bodyMedium,
          ),
          const SizedBox(height: Grid.xxs),
          TextButton(
            key: const Key('search-retry-messages'),
            onPressed: retrying ? null : onRetry,
            child: Text(retrying ? 'Retrying messages…' : 'Retry messages'),
          ),
        ],
      ),
    ),
  );
}

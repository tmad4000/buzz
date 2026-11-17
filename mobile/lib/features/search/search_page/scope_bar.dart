part of '../search_page.dart';

class _SearchScopeBar extends StatelessWidget {
  const _SearchScopeBar({
    required this.channelName,
    required this.scoped,
    required this.onAllChannels,
  });

  final String? channelName;
  final bool scoped;
  final VoidCallback onAllChannels;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(
      horizontal: Grid.gutter,
      vertical: Grid.xxs,
    ),
    child: LayoutBuilder(
      builder: (context, constraints) => Wrap(
        spacing: Grid.half,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: constraints.maxWidth),
            child: Semantics(
              label: scoped
                  ? 'Search scope: ${channelName ?? 'this channel'}'
                  : 'Search scope: all channels',
              child: Align(
                alignment: Alignment.centerLeft,
                child: Chip(
                  key: const Key('search-scope-chip'),
                  avatar: const Icon(BuzzIcons.search300, size: 18),
                  label: Text(
                    scoped ? channelName ?? 'This channel' : 'All channels',
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),
            ),
          ),
          if (scoped)
            TextButton(
              key: const Key('search-all-channels'),
              onPressed: onAllChannels,
              child: const Text('All channels'),
            ),
        ],
      ),
    ),
  );
}

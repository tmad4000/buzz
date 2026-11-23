part of '../search_page.dart';

/// Visible controls for the operators typed in the search field, and the sort.
class _SearchFilterBar extends ConsumerWidget {
  final String query;
  final SearchSort sort;
  final String? currentPubkey;
  final ValueChanged<String> onQueryChanged;

  const _SearchFilterBar({
    required this.query,
    required this.sort,
    required this.currentPubkey,
    required this.onQueryChanged,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final operators = SearchOperators.parse(query);
    final notifier = ref.read(searchProvider.notifier);

    void pick(String kind, PickedOperator? picked) {
      if (kind == 'from') {
        notifier.pickFrom(picked);
      } else {
        notifier.pickChannel(picked);
      }
      onQueryChanged(setSearchOperator(query, kind, picked?.written));
    }

    // A name the operator syntax cannot carry falls back to the id itself.
    PickedOperator picked(String name, String id) => PickedOperator(
      written: formatOperatorValue(name) == null ? id : name,
      id: id,
    );

    Future<void> chooseFrom() async {
      final user = await showBuzzModalBottomSheet<DirectoryUser>(
        context: context,
        title: 'From',
        isScrollControlled: true,
        builder: (_) => const _FromPicker(),
      );
      if (user == null || !context.mounted) return;
      pick('from', picked('@${user.label}', user.pubkey));
    }

    Future<void> chooseChannel() async {
      final channel = await showBuzzModalBottomSheet<Channel>(
        context: context,
        title: 'In',
        isScrollControlled: true,
        builder: (_) => _ChannelPicker(currentPubkey: currentPubkey),
      );
      if (channel == null || !context.mounted) return;
      final label = channel.displayLabel(currentPubkey: currentPubkey);
      pick('in', picked(channel.isDm ? label : '#$label', channel.id));
    }

    final days = _includedDays(operators);

    Future<void> chooseDates() async {
      final now = DateTime.now();
      final last = days.last ?? now;
      final first = days.first ?? last;
      final range = await showDateRangePicker(
        context: context,
        firstDate: DateTime(2020),
        lastDate: DateTime(now.year, now.month, now.day),
        initialDateRange: days.first == null && days.last == null
            ? null
            : _clampedRange(first, last, now),
      );
      if (range == null || !context.mounted) return;
      onQueryChanged(_withDays(query, range.start, range.end));
    }

    return SingleChildScrollView(
      key: const Key('search-filter-bar'),
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(
        horizontal: Grid.gutter,
        vertical: Grid.half,
      ),
      child: Row(
        children: [
          PopupMenuButton<SearchSort>(
            key: const Key('search-sort'),
            initialValue: sort,
            tooltip: 'Sort messages: ${sort.label}',
            onSelected: notifier.setSort,
            itemBuilder: (_) => [
              for (final option in SearchSort.values)
                CheckedPopupMenuItem(
                  key: ValueKey('search-sort-${option.name}'),
                  value: option,
                  checked: option == sort,
                  child: Text(option.label),
                ),
            ],
            // The popup button owns the tap and its label.
            child: ExcludeSemantics(
              child: IgnorePointer(
                child: _FilterButton(
                  icon: BuzzIcons.arrowUpDown,
                  label: 'Sort: ${sort.label}',
                  onPressed: () {},
                ),
              ),
            ),
          ),
          const SizedBox(width: Grid.xxs),
          _FilterButton(
            key: const Key('search-filter-from'),
            icon: BuzzIcons.user,
            label: operators.from == null
                ? 'From'
                : 'From: ${operators.from!.replaceFirst('@', '')}',
            onPressed: chooseFrom,
            onCleared: operators.from == null ? null : () => pick('from', null),
          ),
          const SizedBox(width: Grid.xxs),
          _FilterButton(
            key: const Key('search-filter-in'),
            icon: BuzzIcons.hash,
            label: operators.inChannel == null
                ? 'In'
                : 'In: ${operators.inChannel!.replaceFirst('#', '')}',
            onPressed: chooseChannel,
            onCleared: operators.inChannel == null
                ? null
                : () => pick('in', null),
          ),
          const SizedBox(width: Grid.xxs),
          _FilterButton(
            key: const Key('search-filter-date'),
            icon: BuzzIcons.calendarClock,
            label: days.label,
            onPressed: chooseDates,
            onCleared: days.first == null && days.last == null
                ? null
                : () => onQueryChanged(_withDays(query, null, null)),
          ),
        ],
      ),
    );
  }
}

typedef _Days = ({DateTime? first, DateTime? last, String label});

/// First and last included local days of the parsed range.
_Days _includedDays(SearchOperators operators) {
  DateTime? day(int? seconds) => seconds == null
      ? null
      : DateUtils.dateOnly(DateTime.fromMillisecondsSinceEpoch(seconds * 1000));
  final first = day(operators.since);
  // `before:` is exclusive, so `until` falls on the last included day.
  final last = day(operators.until);
  final label = switch ((first, last)) {
    (null, null) => 'Date',
    (final first?, null) => 'Since ${toOperatorDay(first)}',
    (null, final last?) => 'Through ${toOperatorDay(last)}',
    (final first?, final last?) when first == last => toOperatorDay(first),
    (final first?, final last?) =>
      '${toOperatorDay(first)} – ${toOperatorDay(last)}',
  };
  return (first: first, last: last, label: label);
}

String _withDays(String query, DateTime? first, DateTime? last) =>
    setSearchOperator(
      setSearchOperator(
        query,
        'after',
        first == null ? null : toOperatorDay(first),
      ),
      'before',
      last == null
          ? null
          : toOperatorDay(DateTime(last.year, last.month, last.day + 1)),
    );

/// The date picker asserts its initial range is ordered and inside its limits.
DateTimeRange? _clampedRange(DateTime first, DateTime last, DateTime now) {
  final today = DateUtils.dateOnly(now);
  DateTime clamp(DateTime day) => day.isBefore(DateTime(2020))
      ? DateTime(2020)
      : day.isAfter(today)
      ? today
      : DateUtils.dateOnly(day);
  final (start, end) = (clamp(first), clamp(last));
  return start.isAfter(end) ? null : DateTimeRange(start: start, end: end);
}

class _FilterButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onPressed;
  final VoidCallback? onCleared;

  const _FilterButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onPressed,
    this.onCleared,
  });

  @override
  Widget build(BuildContext context) {
    final active = onCleared != null;
    return InputChip(
      avatar: Icon(icon, size: 16, color: context.colors.onSurfaceVariant),
      label: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 180),
        child: Text(label, overflow: TextOverflow.ellipsis),
      ),
      labelStyle: filterChipTextStyle.copyWith(
        color: active
            ? context.colors.onSurface
            : context.colors.onSurfaceVariant,
      ),
      selected: active,
      showCheckmark: false,
      selectedColor: context.colors.primary.withValues(alpha: 0.12),
      onPressed: onPressed,
      onDeleted: onCleared,
      deleteIcon: const Icon(BuzzIcons.x, size: 14),
      deleteButtonTooltipMessage: 'Clear $label',
    );
  }
}

class _FromPicker extends HookConsumerWidget {
  const _FromPicker();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final search = useState('');
    final users = ref.watch(relayDirectorySearchProvider(search.value));
    return _PickerSheet(
      hint: 'Person or agent',
      onChanged: (value) => search.value = value,
      child: users.when(
        loading: () => const Center(child: BuzzLoadingIndicator(size: 32)),
        error: (_, _) => const Center(child: Text('Could not load people.')),
        data: (users) => users.isEmpty
            ? const Center(child: Text('No one found.'))
            : ListView(
                children: [
                  for (final user in users)
                    ListTile(
                      key: ValueKey('search-filter-from-${user.pubkey}'),
                      title: Text(user.label, style: contentListTitleTextStyle),
                      // Display names repeat; this tells the picks apart.
                      subtitle: Text(
                        user.secondaryLabel,
                        style: contentListBodyTextStyle,
                      ),
                      onTap: () => Navigator.of(context).pop(user),
                    ),
                ],
              ),
      ),
    );
  }
}

class _ChannelPicker extends HookConsumerWidget {
  final String? currentPubkey;

  const _ChannelPicker({required this.currentPubkey});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final search = useState('');
    final needle = search.value.trim().replaceFirst('#', '').toLowerCase();
    String label(Channel channel) =>
        channel.displayLabel(currentPubkey: currentPubkey);
    final channels =
        (ref.watch(channelsProvider).value ?? const <Channel>[])
            .where(
              (channel) =>
                  channel.isMember &&
                  label(channel).toLowerCase().contains(needle),
            )
            .toList()
          ..sort((a, b) => label(a).compareTo(label(b)));
    return _PickerSheet(
      hint: 'Channel',
      onChanged: (value) => search.value = value,
      child: channels.isEmpty
          ? const Center(child: Text('No channel found.'))
          : ListView(
              children: [
                for (final channel in channels)
                  ListTile(
                    key: ValueKey('search-filter-in-${channel.id}'),
                    leading: Icon(channelIcon(channel), size: 20),
                    title: Text(
                      label(channel),
                      style: contentListTitleTextStyle,
                    ),
                    onTap: () => Navigator.of(context).pop(channel),
                  ),
              ],
            ),
    );
  }
}

class _PickerSheet extends StatelessWidget {
  final String hint;
  final ValueChanged<String> onChanged;
  final Widget child;

  const _PickerSheet({
    required this.hint,
    required this.onChanged,
    required this.child,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
    child: SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.5,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Grid.gutter),
            child: TextField(
              key: const Key('search-filter-picker-field'),
              autofocus: true,
              autocorrect: false,
              decoration: InputDecoration(hintText: hint),
              onChanged: onChanged,
            ),
          ),
          Expanded(child: child),
        ],
      ),
    ),
  );
}

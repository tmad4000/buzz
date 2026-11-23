import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/channels/channels_provider.dart';
import 'package:buzz/features/profile/profile_provider.dart';
import 'package:buzz/features/search/recent_searches_provider.dart';
import 'package:buzz/features/search/search_page.dart';
import 'package:buzz/features/search/search_provider.dart';
import 'package:buzz/shared/profile/user_profile.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../helpers/widget_helpers.dart';

class _Search extends SearchNotifier {
  final queries = <String>[];
  PickedOperator? pickedChannel;

  @override
  SearchState build() => const SearchState(query: 'needle');

  @override
  void search(String query) {
    queries.add(query);
    state = SearchState(query: query.trim(), sort: state.sort);
  }

  @override
  void setSort(SearchSort sort) =>
      state = SearchState(query: state.query, sort: sort);

  @override
  void pickChannel(PickedOperator? picked) => pickedChannel = picked;
}

class _Recent extends RecentSearchesNotifier {
  @override
  List<String> build() => const [];
}

class _Profile extends ProfileNotifier {
  @override
  Future<UserProfile?> build() async => null;
}

class _Channels extends ChannelsNotifier {
  @override
  Future<List<Channel>> build() async => [
    Channel(
      id: 'channel-1',
      name: 'Paseo P2',
      channelType: 'stream',
      visibility: 'open',
      description: '',
      createdBy: 'a',
      createdAt: DateTime(2026),
      memberCount: 1,
      isMember: true,
    ),
  ];
}

void main() {
  Future<_Search> pump(WidgetTester tester) async {
    final search = _Search();
    await tester.pumpWidget(
      WidgetHelpers.testable(
        overrides: [
          searchProvider.overrideWith(() => search),
          recentSearchesProvider.overrideWith(_Recent.new),
          profileProvider.overrideWith(_Profile.new),
          channelsProvider.overrideWith(_Channels.new),
        ],
        child: const SearchPage(),
      ),
    );
    await tester.pumpAndSettle();
    return search;
  }

  testWidgets('sort is labelled Relevance and can be changed', (tester) async {
    await pump(tester);
    expect(find.text('Sort: Relevance'), findsOneWidget);
    await tester.tap(find.byKey(const Key('search-sort')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('search-sort-oldest')));
    await tester.pumpAndSettle();
    expect(find.text('Sort: Oldest'), findsOneWidget);
  });

  testWidgets('picking a channel writes the operator and binds its id', (
    tester,
  ) async {
    final search = await pump(tester);
    await tester.tap(find.byKey(const Key('search-filter-in')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('search-filter-in-channel-1')));
    await tester.pumpAndSettle();
    expect(search.queries.single, 'in:"#Paseo P2" ');
    expect(search.pickedChannel?.id, 'channel-1');
    expect(find.text('In: Paseo P2'), findsOneWidget);

    await tester.tap(find.byTooltip('Clear In: Paseo P2'));
    await tester.pumpAndSettle();
    expect(search.queries.last, '');
    expect(search.pickedChannel, isNull);
  });
}

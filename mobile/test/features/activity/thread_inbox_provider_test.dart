import 'dart:async';

import 'package:buzz/features/activity/activity_provider.dart';
import 'package:buzz/features/activity/feed_item.dart';
import 'package:buzz/features/activity/inbox_read_state.dart';
import 'package:buzz/shared/read_state/read_state_format.dart';
import 'package:buzz/features/activity/thread_inbox_state.dart';
import 'package:buzz/features/channels/thread_follows/thread_follows_provider.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:flutter_test/flutter_test.dart';

import 'thread_inbox_fixtures.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'unmentioned authored, participated and followed replies enter the real source',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1), topic(2), topic(3)],
        replies: [response(21, 1), response(22, 2), response(23, 3)],
        authored: {eventId(1)},
        participated: {eventId(2)},
        followed: {eventId(3)},
      );
      await f.settle();
      expect(f.state.items.map((item) => item.id).toSet(), {
        eventId(21),
        eventId(22),
        eventId(23),
      });
      expect(f.state.phase, ThreadInboxPhase.ready);
      expect(f.state.loading, isFalse);
      expect(f.session.reads.first.ids!.toSet(), {
        eventId(1),
        eventId(2),
        eventId(3),
      });
      expect(f.session.reads.last.tags['#h'], ['a']);
      expect(f.session.reads.last.tags['#e']!.toSet(), {
        eventId(1),
        eventId(2),
        eventId(3),
      });
    },
  );
  test(
    'merge deduplicates addressed/DM/interest event IDs, preserves canonical root and never refetches base on source updates',
    () async {
      final event = response(
        21,
        1,
        tags: [
          ['h', 'a'],
          ['e', eventId(1), '', 'root'],
          ['e', eventId(10), '', 'reply'],
          ['p', me],
        ],
      );
      final f = await ThreadFixture.create(
        channels: [memberChannel('a', type: 'dm')],
        roots: [topic(1)],
        replies: [event],
        authored: {eventId(1)},
      );
      final item = FeedItem(
        id: event.id,
        kind: 9,
        pubkey: event.pubkey,
        content: event.content,
        createdAt: event.createdAt,
        channelId: 'a',
        channelName: 'a',
        tags: event.tags,
        category: 'mention',
      );
      f.base.feed = HomeFeedResponse(
        mentions: [item],
        needsAction: [],
        activity: [item],
        agentActivity: [],
      );
      f.container.listen(inboxItemsProvider, (_, _) {});
      await f.settle();
      final rows = f.container.read(inboxItemsProvider);
      expect(rows, hasLength(1));
      expect(rows.single.conversationId, eventId(1));
      expect(rows.single.groupItems, hasLength(1));
      expect(rows.single.item.category, 'mention');
      expect(f.base.builds, 1);
      final reads = f.session.reads.length;
      f.channels.change([
        memberChannel(
          'a',
          type: 'dm',
        ).copyWith(lastMessageAt: DateTime.utc(2026, 1, 2)),
      ]);
      await f.settle();
      expect(
        f.session.reads.length,
        reads,
        reason: 'Timestamps must not refetch tracked sources',
      );
      f.session.live.single.onEvent(response(22, 1));
      await f.settle();
      expect(
        f.container.read(inboxItemsProvider).single.groupItems,
        hasLength(2),
      );
      expect(f.base.builds, 1);
    },
  );
  test(
    'interest rows reuse canonical read frontier and personal unread without shared obligations',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        replies: [response(21, 1), response(22, 1)],
      );
      f.container.listen(inboxItemsProvider, (_, _) {});
      await f.settle();
      final row = f.container.read(inboxItemsProvider).single;
      final contexts = <String, int>{
        threadContextKey(eventId(1)): row.latestActivityAt,
      };
      expect(row.isActionRequired, isFalse);
      expect(row.threadRootId, eventId(1));
      expect(
        resolveInboxItemReadAt(row, markerOf: (id) => contexts[id]),
        row.latestActivityAt,
      );
      expect(
        isInboxItemDone(
          row,
          markerOf: (id) => contexts[id],
          localUnreadOverrides: {},
          localDoneSet: {},
        ),
        isTrue,
      );
      expect(
        isInboxItemDone(
          row,
          markerOf: (id) => contexts[id],
          localUnreadOverrides: {eventId(21)},
          localDoneSet: {},
        ),
        isFalse,
      );
      expect(
        isInboxItemDone(
          row,
          markerOf: (_) => null,
          localUnreadOverrides: {},
          localDoneSet: {row.id},
        ),
        isFalse,
      );
      expect(
        groupedChannelReadTimestamp(row),
        isNull,
        reason: 'reading this thread cannot swallow unrelated channel traffic',
      );
    },
  );
  test(
    'strict returned row validation rejects wrong h/root cross-product and own replies',
    () async {
      final f = await ThreadFixture.create(
        channels: [memberChannel('a'), memberChannel('b')],
        roots: [
          topic(1),
          topic(2, channel: 'b'),
        ],
        replies: [response(21, 1)],
        authored: {eventId(1), eventId(2)},
        holdRoots: true,
      );
      f.session.extraReplies = [
        response(22, 1, channel: 'b'),
        response(23, 99),
        response(24, 1, author: me),
        response(
          25,
          1,
          tags: [
            ['h', 'a'],
            ['h', 'b'],
            ['e', eventId(1), '', 'reply'],
          ],
        ),
      ];
      f.session.releaseReads();
      await f.settle();
      expect(f.state.items.map((item) => item.id), [eventId(21)]);
    },
  );
  test(
    'membership loss while resolving roots prevents paired reads and discards late source data',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [response(21, 1)],
        authored: {eventId(1)},
        holdRoots: true,
      );
      await f.settle();
      expect(f.session.pendingReads, hasLength(1));
      f.channels.change([memberChannel('a', member: false)]);
      f.session.releaseReads();
      await f.settle();
      expect(f.state.items, isEmpty);
      expect(
        f.session.reads.where((filter) => filter.tags.containsKey('#e')),
        isEmpty,
      );
      expect(f.state.phase, ThreadInboxPhase.unavailable);
    },
  );
  test(
    'active membership removal clears owned cache and old live callbacks immediately',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [response(21, 1)],
        authored: {eventId(1)},
      );
      await f.settle();
      final old = f.session.live.single;
      f.channels.change([memberChannel('a', member: false)]);
      old.onEvent(response(22, 1));
      await f.settle();
      expect(f.state.items, isEmpty);
      expect(old.closed, isTrue);
    },
  );
  test(
    'normal follow/unfollow store changes invalidate the source and close former live ownership',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [response(21, 1)],
        followed: {eventId(1)},
      );
      await f.settle();
      final old = f.session.live.single;
      f.container
          .read(threadFollowsProvider.notifier)
          .unfollowThread(eventId(1));
      await f.settle();
      expect(f.state.phase, ThreadInboxPhase.idle);
      expect(f.state.items, isEmpty);
      expect(old.closed, isTrue);
      old.onEvent(response(22, 1));
      expect(f.state.items, isEmpty);
      f.container.read(threadFollowsProvider.notifier).followThread(eventId(1));
      await f.settle();
      expect(f.state.items, hasLength(1));
      expect(
        f.session.reads.where((filter) => filter.ids != null),
        hasLength(2),
      );
    },
  );
  test(
    'community switch fences held history and clears root cache even for identical root and member IDs',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [response(21, 1)],
        authored: {eventId(1)},
        holdRoots: true,
      );
      await f.settle();
      f.container
          .read(relayConfigProvider.notifier)
          .update(baseUrl: 'https://community-b.test');
      f.session.roots = [];
      await f.settle();
      f.session.releaseReads();
      await f.settle();
      expect(f.state.items, isEmpty);
      expect(f.state.phase, ThreadInboxPhase.unavailable);
      expect(f.session.realms.toSet(), {
        'https://community-a.test',
        'https://community-b.test',
      });
      expect(
        f.session.reads.where((filter) => filter.tags.containsKey('#e')),
        isEmpty,
      );
    },
  );
  test(
    'identity switch fences an in-flight reply read and clears former identity interests',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [response(21, 1)],
        authored: {eventId(1)},
        holdReplies: true,
      );
      await f.settle();
      expect(f.session.pendingReads, hasLength(1));
      f.container.read(testIdentityProvider.notifier).change('c' * 64);
      f.session.releaseReads();
      await f.settle();
      expect(f.state.items, isEmpty);
      expect(f.state.phase, ThreadInboxPhase.idle);
    },
  );
  test(
    'unavailable root or reply reads are never successful empty; retry recovers without a base-feed loop',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        failReplies: true,
      );
      await f.settle();
      expect(f.state.phase, ThreadInboxPhase.partial);
      expect(f.state.unavailableRoots, isTrue);
      expect(f.state.items, isEmpty);
      f.session.failReplies = false;
      await f.source.refresh();
      await f.settle();
      expect(f.state.phase, ThreadInboxPhase.ready);
      expect(f.state.unavailableRoots, isFalse);
      expect(f.state.items, isEmpty);
      final missing = await ThreadFixture.create(authored: {eventId(2)});
      await missing.settle();
      expect(missing.state.phase, ThreadInboxPhase.unavailable);
      final failed = await ThreadFixture.create(
        authored: {eventId(3)},
        failRoots: true,
      );
      await failed.settle();
      expect(failed.state.phase, ThreadInboxPhase.unavailable);
    },
  );
  test(
    'load more uses bounded exact roots, paired queries and the hard view cap, not scan-all',
    () async {
      final f = await ThreadFixture.create(
        channels: [for (var n = 1; n <= 130; n++) memberChannel('c$n')],
        roots: [for (var n = 1; n <= 130; n++) topic(n, channel: 'c$n')],
        replies: [
          for (var n = 1; n <= 130; n++) response(1000 + n, n, channel: 'c$n'),
        ],
        authored: {for (var n = 1; n <= 130; n++) eventId(n)},
      );
      await f.settle();
      expect(f.state.loadedRoots, 20);
      expect(f.state.canLoadMore, isTrue);
      for (var n = 0; n < 4; n++) {
        await f.source.loadMore();
        await f.settle();
      }
      expect(f.state.loadedRoots, 100);
      expect(f.state.rootCapReached, isTrue);
      expect(f.state.hasMoreRoots, isTrue);
      expect(f.state.canLoadMore, isFalse);
      final count = f.session.reads.length;
      await f.source.loadMore();
      expect(f.session.reads.length, count);
      for (final filter in f.session.reads) {
        if (filter.ids != null) {
          expect(filter.ids!.length, lessThanOrEqualTo(20));
          expect(filter.limit, lessThanOrEqualTo(20));
        } else {
          expect(filter.tags['#e']!.length, lessThanOrEqualTo(10));
          expect(filter.tags['#h']!.length, lessThanOrEqualTo(10));
          expect(filter.limit, 50);
        }
      }
      expect(f.session.maxActiveReads, lessThanOrEqualTo(2));
      expect(
        f.session.live.where((entry) => !entry.closed).length,
        lessThanOrEqualTo(10),
      );
    },
  );
  test(
    'held reads enforce two-history-request budget across every loaded page',
    () async {
      final f = await ThreadFixture.create(
        roots: [for (var n = 1; n <= 60; n++) topic(n)],
        authored: {for (var n = 1; n <= 60; n++) eventId(n)},
      );
      await f.settle();
      await f.source.loadMore();
      await f.settle();
      f.session.holdReplies = true;
      final loading = f.source.loadMore();
      await f.settle();
      expect(f.session.activeReads, 2);
      expect(f.session.pendingReads, hasLength(2));
      for (var group = 0; group < 3; group++) {
        final pending = f.session.pendingReads
            .where((read) => !read.completer.isCompleted)
            .toList();
        expect(pending, hasLength(2));
        for (final read in pending) {
          read.completer.complete(read.rows);
        }
        await f.settle();
        expect(f.session.activeReads, lessThanOrEqualTo(2));
      }
      await loading;
      expect(f.state.loadedRoots, 60);
      expect(f.session.pendingReads, hasLength(6));
      expect(f.session.maxActiveReads, 2);
    },
  );
  test(
    'history saturation and bounded live eviction remain explicit partial coverage',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [for (var n = 1; n <= 80; n++) response(1000 + n, 1)],
        authored: {eventId(1)},
      );
      await f.settle();
      expect(f.state.items, hasLength(50));
      expect(f.state.historyLimited, isTrue);
      expect(f.state.phase, ThreadInboxPhase.partial);
      for (var n = 1; n <= 510; n++) {
        f.session.live.single.onEvent(response(5000 + n, 1));
      }
      expect(f.state.items, hasLength(500));
      expect(f.state.historyLimited, isTrue);
      expect(f.state.phase, ThreadInboxPhase.partial);
    },
  );
  test(
    'pending subscription setup bounds repeated retry/load-more and cleans late ownership after disposal',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        holdSubscriptions: true,
      );
      await f.settle();
      expect(f.state.loading, isTrue);
      final count = f.session.reads.length;
      unawaited(f.source.refresh());
      unawaited(f.source.loadMore());
      await f.settle();
      expect(f.session.reads.length, count);
      f.container.dispose();
      for (final pending in f.session.pendingSubscriptions) {
        pending.$2.complete(pending.$1.close);
      }
      await Future<void>.value();
      expect(f.session.pendingSubscriptions.single.$1.closed, isTrue);
    },
  );
  test(
    '51 arrivals during held history are observed live, including the oldest, without capped late replay',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        holdReplies: true,
      );
      await f.settle();
      expect(
        f.session.pendingReads.where((read) => read.filter.ids == null),
        hasLength(1),
      );
      expect(
        f.session.live,
        hasLength(1),
        reason: 'live must precede finite reply history',
      );
      expect(f.state.loading, isTrue);
      for (var n = 100; n < 151; n++) {
        f.session.live.single.onEvent(response(n, 1));
      }
      expect(f.state.items, hasLength(51));
      expect(f.state.items.any((item) => item.id == eventId(100)), isTrue);
      f.session.releaseReads();
      await f.settle();
      expect(f.state.items, hasLength(51));
      expect(f.state.phase, ThreadInboxPhase.ready);
      expect(f.state.historyLimited, isFalse);
    },
  );
  test(
    'fallback completion without EOSE stays partial and real EOSE alone restores live readiness',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        signalReady: false,
      );
      await f.settle();
      expect(f.state.loading, isFalse);
      expect(f.state.phase, ThreadInboxPhase.partial);
      expect(f.state.liveUnavailable, isTrue);
      f.session.live.single.status(RelaySubscriptionStatus.ready);
      expect(f.state.phase, ThreadInboxPhase.ready);
      expect(f.state.liveUnavailable, isFalse);
    },
  );
  test(
    'capped replay remains partial after EOSE and later history, and early live eviction is retained',
    () async {
      final capped = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        initialReplay: [for (var n = 100; n < 150; n++) response(n, 1)],
      );
      await capped.settle();
      expect(capped.state.items, hasLength(50));
      expect(capped.state.phase, ThreadInboxPhase.partial);
      expect(capped.state.historyLimited, isTrue);
      expect(capped.state.liveUnavailable, isFalse);
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        holdReplies: true,
      );
      await f.settle();
      for (var n = 100; n < 610; n++) {
        f.session.live.single.onEvent(response(n, 1));
      }
      expect(f.state.items, hasLength(500));
      f.session.releaseReads();
      await f.settle();
      expect(f.state.items, hasLength(500));
      expect(f.state.phase, ThreadInboxPhase.partial);
      expect(f.state.historyLimited, isTrue);
      f.session.live.single.status(RelaySubscriptionStatus.ready);
      expect(f.state.phase, ThreadInboxPhase.partial);
    },
  );
  test(
    'membership loss during early subscription setup starts no history and closes late ownership',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        holdSubscriptions: true,
      );
      await f.settle();
      expect(f.session.reads.where((filter) => filter.ids == null), isEmpty);
      final (live, completion) = f.session.pendingSubscriptions.single;
      f.channels.change([memberChannel('a', member: false)]);
      await f.settle();
      completion.complete(live.close);
      await f.settle();
      expect(live.closed, isTrue);
      live.onEvent(response(100, 1));
      expect(f.state.items, isEmpty);
      expect(f.session.reads.where((filter) => filter.ids == null), isEmpty);
    },
  );
  test(
    'live admission failure is partial, retries recover, and stale callbacks cannot undo it',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
      );
      await f.settle();
      final first = f.session.live.single;
      first.onClosed!('synthetic rejection');
      expect(f.state.phase, ThreadInboxPhase.partial);
      expect(f.state.liveUnavailable, isTrue);
      await f.source.refresh();
      await f.settle();
      expect(first.closed, isTrue);
      expect(f.state.phase, ThreadInboxPhase.ready);
      first.onClosed!('retired rejection');
      expect(f.state.phase, ThreadInboxPhase.ready);
      f.session.live.last.status(RelaySubscriptionStatus.retrying);
      expect(f.state.phase, ThreadInboxPhase.partial);
      f.session.live.last.status(RelaySubscriptionStatus.ready);
      expect(f.state.phase, ThreadInboxPhase.partial);
      expect(
        f.state.liveUnavailable,
        isTrue,
        reason: 'EOSE cannot expose a cap hidden by transport replay dedup',
      );
      await f.source.refresh();
      await f.settle();
      expect(f.state.phase, ThreadInboxPhase.ready);
    },
  );
  test(
    'unknown membership is unavailable and issues no root or paired query',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
      );
      await f.settle();
      f.channels.unavailable();
      await f.settle();
      final reads = f.session.reads.length;
      expect(f.state.phase, ThreadInboxPhase.unavailable);
      expect(f.state.items, isEmpty);
      await f.source.refresh();
      await f.settle();
      expect(f.state.phase, ThreadInboxPhase.unavailable);
      expect(f.session.reads.length, reads);
    },
  );
  test(
    'slow history subscribes from read-start overlap rather than leaving a forwarding gap',
    () async {
      final started = DateTime.now().millisecondsSinceEpoch ~/ 1000;
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        authored: {eventId(1)},
        holdRoots: true,
      );
      await f.settle();
      await Future<void>.delayed(const Duration(seconds: 6));
      f.session.releaseReads();
      await f.settle();
      expect(f.session.live.single.filter.since, lessThanOrEqualTo(started));
    },
  );
  test(
    'disconnect retains already accepted cache as partial and reconnect restores live updates',
    () async {
      final f = await ThreadFixture.create(
        roots: [topic(1)],
        replies: [response(21, 1)],
        authored: {eventId(1)},
      );
      await f.settle();
      final old = f.session.live.single;
      f.session.connection(SessionStatus.disconnected);
      await f.settle();
      expect(f.state.items, hasLength(1));
      expect(f.state.phase, ThreadInboxPhase.partial);
      expect(f.state.liveUnavailable, isTrue);
      expect(old.closed, isTrue);
      old.onEvent(response(22, 1));
      expect(f.state.items, hasLength(1));
      f.session.connection(SessionStatus.connected);
      await f.settle();
      expect(f.state.phase, ThreadInboxPhase.ready);
      expect(f.state.items, hasLength(1));
    },
  );
}

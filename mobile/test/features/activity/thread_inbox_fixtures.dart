import 'dart:async';

import 'package:buzz/features/activity/activity_provider.dart';
import 'package:buzz/features/activity/feed_item.dart';
import 'package:buzz/features/activity/thread_inbox_provider.dart';
import 'package:buzz/features/activity/thread_inbox_state.dart';
import 'package:buzz/features/channels/channel.dart';
import 'package:buzz/features/channels/channels_provider.dart';
import 'package:buzz/features/channels/thread_follows/thread_follows_provider.dart';
import 'package:buzz/shared/relay/relay.dart';
import 'package:buzz/shared/theme/theme_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

String eventId(int n) => n.toRadixString(16).padLeft(64, '0');
final me = 'a' * 64, other = 'b' * 64;
Channel memberChannel(
  String id, {
  bool member = true,
  String type = 'stream',
}) => Channel(
  id: id,
  name: id,
  channelType: type,
  visibility: 'private',
  description: '',
  createdBy: me,
  createdAt: DateTime.utc(2026),
  memberCount: 2,
  isMember: member,
);
NostrEvent topic(
  int n, {
  String channel = 'a',
  int kind = 9,
  List<List<String>>? tags,
}) => NostrEvent(
  id: eventId(n),
  pubkey: me,
  kind: kind,
  createdAt: 1000,
  tags:
      tags ??
      [
        ['h', channel],
      ],
  content: 'Synthetic root',
  sig: 'not-a-proof',
);
NostrEvent response(
  int n,
  int root, {
  String channel = 'a',
  int kind = 9,
  String? author,
  List<List<String>>? tags,
}) => NostrEvent(
  id: eventId(n),
  pubkey: author ?? other,
  kind: kind,
  createdAt: 1001 + n,
  tags:
      tags ??
      [
        ['h', channel],
        ['e', eventId(root), '', 'reply'],
      ],
  content: 'Synthetic reply $n',
  sig: 'not-a-proof',
);

class TestConfig extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://community-a.test');
}

class TestIdentity extends Notifier<String?> {
  @override
  String? build() => me;
  void change(String? pubkey) => state = pubkey;
}

final testIdentityProvider = NotifierProvider<TestIdentity, String?>(
  TestIdentity.new,
);

class TestInterest extends Notifier<ThreadInterestSnapshot> {
  @override
  ThreadInterestSnapshot build() =>
      ThreadInterestSnapshot(pubkey: me, authored: {}, participated: {});
  void change({
    String? pubkey,
    Set<String> authored = const {},
    Set<String> participated = const {},
  }) => state = ThreadInterestSnapshot(
    pubkey: pubkey ?? me,
    authored: authored,
    participated: participated,
  );
}

final testInterestProvider =
    NotifierProvider<TestInterest, ThreadInterestSnapshot>(TestInterest.new);

class TestChannels extends ChannelsNotifier {
  TestChannels(this.initial);
  final List<Channel> initial;
  @override
  Future<List<Channel>> build() async => initial;
  void change(List<Channel> channels) => state = AsyncData(channels);
  void unavailable() => state = const AsyncLoading();
  @override
  Future<void> refresh({bool fetchDirectory = false}) async =>
      throw StateError('synthetic unavailable membership');
}

class TestBaseFeed extends ActivityNotifier {
  int builds = 0;
  HomeFeedResponse feed = HomeFeedResponse(
    mentions: [],
    needsAction: [],
    activity: [],
    agentActivity: [],
  );
  @override
  Future<HomeFeedResponse> build() async {
    builds++;
    return feed;
  }
}

class PendingRead {
  PendingRead(this.filter, this.realm, this.rows);
  final NostrFilter filter;
  final String realm;
  final List<NostrEvent> rows;
  final completer = Completer<List<NostrEvent>>();
}

class TestLive {
  TestLive(this.filter, this.onEvent, this.status, this.onClosed);
  final NostrFilter filter;
  final void Function(NostrEvent) onEvent;
  final void Function(RelaySubscriptionStatus) status;
  final void Function(String)? onClosed;
  bool closed = false;
  void close() => closed = true;
}

class TestSession extends RelaySessionNotifier {
  final reads = <NostrFilter>[];
  final realms = <String>[];
  final live = <TestLive>[];
  final pendingReads = <PendingRead>[];
  final pendingSubscriptions = <(TestLive, Completer<void Function()>)>[];
  List<NostrEvent> roots = [], replies = [], extraRoots = [], extraReplies = [];
  List<NostrEvent> initialReplay = [];
  bool signalReady = true;
  bool holdRoots = false, holdReplies = false, holdSubscriptions = false;
  bool failRoots = false, failReplies = false;
  int activeReads = 0, maxActiveReads = 0;
  @override
  SessionState build() => const SessionState(status: SessionStatus.connected);
  void connection(SessionStatus status) => state = SessionState(status: status);
  @override
  Future<List<NostrEvent>> fetchHistory(
    NostrFilter filter, {
    Duration timeout = const Duration(seconds: 8),
  }) async {
    reads.add(filter);
    final realm = ref.read(relayConfigProvider).baseUrl;
    realms.add(realm);
    activeReads++;
    if (activeReads > maxActiveReads) maxActiveReads = activeReads;
    try {
      final rootQuery = filter.ids != null;
      if (rootQuery ? failRoots : failReplies) {
        throw StateError('synthetic history unavailable');
      }
      final rows = rootQuery
          ? [
              for (final event in roots)
                if (filter.ids!.contains(event.id)) event,
              ...extraRoots,
            ]
          : [
              for (final event in replies)
                if (event.tags.any(
                      (tag) =>
                          tag.length > 1 &&
                          tag[0] == 'h' &&
                          (filter.tags['#h'] ?? []).contains(tag[1]),
                    ) &&
                    event.tags.any(
                      (tag) =>
                          tag.length > 1 &&
                          tag[0] == 'e' &&
                          (filter.tags['#e'] ?? []).contains(tag[1]),
                    ))
                  event,
              ...extraReplies,
            ];
      final limited = rows.take(filter.limit).toList();
      if (rootQuery ? holdRoots : holdReplies) {
        final request = PendingRead(filter, realm, limited);
        pendingReads.add(request);
        return await request.completer.future;
      }
      return await Future.value(limited);
    } finally {
      activeReads--;
    }
  }

  @override
  Future<void Function()> subscribeWithStatus(
    NostrFilter filter,
    void Function(NostrEvent) onEvent, {
    void Function(String)? onClosed,
    required void Function(RelaySubscriptionStatus) onStatusChanged,
  }) async {
    final entry = TestLive(filter, onEvent, onStatusChanged, onClosed);
    live.add(entry);
    if (holdSubscriptions) {
      final pending = Completer<void Function()>();
      pendingSubscriptions.add((entry, pending));
      return pending.future;
    }
    for (final event in initialReplay) {
      onEvent(event);
    }
    if (signalReady) onStatusChanged(RelaySubscriptionStatus.ready);
    return entry.close;
  }

  void releaseReads() {
    holdRoots = false;
    holdReplies = false;
    for (final request in pendingReads) {
      if (!request.completer.isCompleted) {
        request.completer.complete(request.rows);
      }
    }
  }
}

class ThreadFixture {
  ThreadFixture._(this.container, this.session, this.channels, this.base);
  final ProviderContainer container;
  final TestSession session;
  final TestChannels channels;
  final TestBaseFeed base;
  static Future<ThreadFixture> create({
    List<Channel>? channels,
    List<NostrEvent> roots = const [],
    List<NostrEvent> replies = const [],
    Set<String> authored = const {},
    Set<String> participated = const {},
    Set<String> followed = const {},
    bool holdRoots = false,
    bool holdReplies = false,
    bool holdSubscriptions = false,
    bool failRoots = false,
    bool failReplies = false,
    List<NostrEvent> initialReplay = const [],
    bool signalReady = true,
  }) async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final session = TestSession()
      ..roots = roots
      ..replies = replies
      ..holdRoots = holdRoots
      ..holdReplies = holdReplies
      ..holdSubscriptions = holdSubscriptions
      ..failRoots = failRoots
      ..failReplies = failReplies;
    session.initialReplay = initialReplay;
    session.signalReady = signalReady;
    final roster = TestChannels(channels ?? [memberChannel('a')]);
    final base = TestBaseFeed();
    final container = ProviderContainer(
      retry: (_, _) => null,
      overrides: [
        relayConfigProvider.overrideWith(TestConfig.new),
        relaySessionProvider.overrideWith(() => session),
        myPubkeyProvider.overrideWith((ref) => ref.watch(testIdentityProvider)),
        channelsProvider.overrideWith(() => roster),
        savedPrefsProvider.overrideWithValue(prefs),
        channelThreadInterestProvider.overrideWith(
          (ref) => ref.watch(testInterestProvider),
        ),
        activityProvider.overrideWith(() => base),
      ],
    );
    addTearDown(container.dispose);
    await container.read(channelsProvider.future);
    container
        .read(testInterestProvider.notifier)
        .change(authored: authored, participated: participated);
    for (final root in followed) {
      container.read(threadFollowsProvider.notifier).followThread(root);
    }
    container.listen(threadInboxProvider, (_, _) {});
    return ThreadFixture._(container, session, roster, base);
  }

  ThreadInboxState get state => container.read(threadInboxProvider);
  ThreadInboxNotifier get source =>
      container.read(threadInboxProvider.notifier);
  Future<void> settle() async {
    for (var n = 0; n < 80; n++) {
      await Future<void>.value();
      await container.pump();
    }
  }
}

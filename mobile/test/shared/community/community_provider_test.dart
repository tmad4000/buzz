import 'dart:io';
import 'dart:typed_data';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/offline/offline_cache.dart';
import 'package:buzz/shared/relay/relay_provider.dart';
import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:buzz/shared/community/community.dart';
import 'package:buzz/shared/community/community_provider.dart';
import 'package:buzz/shared/community/community_storage.dart';
import 'package:buzz/shared/push/push_subscription.dart';
import 'package:nostr/nostr.dart' as nostr;

import 'community_storage_test.dart';

void main() {
  late Directory offlineRoot;
  late FakeSecureStorage fakeSecure;
  late CommunityStorage communityStorage;
  late ProviderContainer container;
  late List<List<Community>> snapshots;
  late List<String> deactivatedCommunityIds;
  late List<int?> deactivationGenerations;
  late List<String> journaledCommunityIds;
  late int revocationTriggers;
  late CommunityPushLeaseRevocationTrigger revocationTrigger;
  late CommunityPushLeaseDeactivator deactivator;

  setUp(() async {
    offlineRoot = await Directory.systemTemp.createTemp('buzz-offline-logout-');
    fakeSecure = FakeSecureStorage();
    communityStorage = CommunityStorage(secure: fakeSecure);
    snapshots = [];
    deactivatedCommunityIds = [];
    deactivationGenerations = [];
    journaledCommunityIds = [];
    revocationTriggers = 0;
    revocationTrigger = () async {
      revocationTriggers += 1;
    };
    deactivator = (community, {generation}) async {
      deactivatedCommunityIds.add(community.id);
      deactivationGenerations.add(generation);
    };
  });

  tearDown(() async {
    container.dispose();
    await offlineRoot.delete(recursive: true);
  });

  ProviderContainer createContainer({bool offline = false}) {
    Future<void> writeSnapshot(List<Community> communities) async {
      snapshots.add(List.of(communities));
    }

    return ProviderContainer(
      overrides: [
        offlineEnabledProvider.overrideWithValue(offline),
        offlineDirectoryProvider.overrideWithValue(() async {
          if (!offline) throw StateError('OFF must never resolve filesystem');
          return offlineRoot;
        }),
        communityStorageProvider.overrideWithValue(communityStorage),
        communitySnapshotWriterProvider.overrideWithValue(writeSnapshot),
        communityPushLeaseDeactivatorProvider.overrideWithValue(deactivator),
        communityPushLeaseRevocationEnqueuerProvider.overrideWithValue((
          community,
        ) async {
          journaledCommunityIds.add(community.id);
          return true;
        }),
        communityPushLeaseRevocationTriggerProvider.overrideWithValue(
          revocationTrigger,
        ),
      ],
    );
  }

  test(
    'P1 logout removes cached bytes and retires old writers before credentials disappear',
    () async {
      final keys = nostr.Keys.generate();
      final community = Community.create(
        name: 'Cached',
        relayUrl: 'https://cached.test',
        nsec: keys.nsec,
      );
      await communityStorage.save(community);
      final scope = offlineMobileScope(
        RelayConfig(baseUrl: community.relayUrl).wsUrl,
        keys.public,
      );
      final store = OfflineCacheStore(
        root: offlineRoot,
        scope: scope,
        cipher: Nip44OfflineCipher(Uint8List.fromList(List.filled(32, 5))),
      );
      await store.save('head', 'general', ['cached payload']);
      container = createContainer(offline: true);
      await container.read(communityListProvider.future);
      await container
          .read(communityListProvider.notifier)
          .removeCommunity(community.id);
      expect(await store.load('head', 'general'), isNull);
      expect(await communityStorage.loadAll(), isEmpty);
      await store.save('head', 'queued', ['pre-logout completion']);
      expect(await store.load('head', 'queued'), isNull);
    },
  );

  test(
    'flag OFF removal never resolves offline filesystem even with a signing identity',
    () async {
      final community = Community.create(
        name: 'OFF',
        relayUrl: 'https://off.test',
        nsec: nostr.Keys.generate().nsec,
      );
      await communityStorage.save(community);
      // createContainer's OFF directory seam throws on any access.
      container = createContainer();
      await container.read(communityListProvider.future);
      await container
          .read(communityListProvider.notifier)
          .removeCommunity(community.id);
      expect(await communityStorage.loadAll(), isEmpty);
    },
  );

  group('CommunityListNotifier', () {
    test('loads empty list initially', () async {
      container = createContainer();
      final communities = await container.read(communityListProvider.future);
      expect(communities, isEmpty);
      expect(snapshots, [isEmpty]);
    });

    test('exports migrated communities on startup', () async {
      final community = Community.create(
        name: 'Migrated',
        relayUrl: 'https://migrated.example.com',
        nsec: nostr.Keys.generate().nsec,
      );
      // Seed legacy storage to exercise the same migration path as an app
      // upgrade.
      fakeSecure['buzz_workspaces'] = jsonEncode([community.toJson()]);

      container = createContainer();
      await container.read(communityListProvider.future);

      expect(snapshots.single.single.id, community.id);
      expect(fakeSecure['buzz_workspaces'], isNull);
    });

    test('skips an unchanged snapshot after provider invalidation', () async {
      final community = Community.create(
        name: 'Stored',
        relayUrl: 'https://stored.example.com',
        nsec: nostr.Keys.generate().nsec,
      );
      await communityStorage.save(community);
      container = createContainer();

      await container.read(communityListProvider.future);
      container.invalidate(communityListProvider);
      await container.read(communityListProvider.future);

      expect(snapshots, hasLength(1));
    });

    test('addCommunity adds to list', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws = Community.create(
        name: 'Test',
        relayUrl: 'https://test.example.com',
      );
      await container.read(communityListProvider.notifier).addCommunity(ws);

      final communities = await container.read(communityListProvider.future);
      expect(communities, hasLength(1));
      expect(communities.first.name, 'Test');
    });

    test(
      'push notifications default off and opt-in survives restart',
      () async {
        container = createContainer();
        await container.read(communityListProvider.future);
        final community = Community.create(
          name: 'Test',
          relayUrl: 'https://test.example.com',
        );
        await container
            .read(communityListProvider.notifier)
            .addCommunity(community);
        expect(
          (await container.read(
            communityListProvider.future,
          )).single.pushNotificationsEnabled,
          isFalse,
        );

        await container
            .read(communityListProvider.notifier)
            .setPushNotificationsEnabled(community.id, true);
        container.dispose();
        container = createContainer();

        expect(
          (await container.read(
            communityListProvider.future,
          )).single.pushNotificationsEnabled,
          isTrue,
        );
      },
    );

    test(
      'lease retry reserves beyond a locally unaccepted generation',
      () async {
        container = createContainer();
        await container.read(communityListProvider.future);
        final subscription = BuzzPushSubscription(
          filter: BuzzPushFilter(kinds: const [9], pTags: ['a' * 64]),
          notificationClass: 'default',
        );
        final subscriptionState = BuzzPushLeaseSubscriptionState.desired(
          desired: [subscription],
        ).withAccepted(subscriptions: [subscription], generation: 4);
        final community =
            Community.create(
              name: 'Test',
              relayUrl: 'https://test.example.com',
            ).copyWith(
              pushNotificationsEnabled: true,
              pushSubscriptionState: subscriptionState,
            );
        final notifier = container.read(communityListProvider.notifier);
        await notifier.addCommunity(community);

        expect(await notifier.reservePushLeaseGeneration(community.id), 5);
        expect(await notifier.reservePushLeaseGeneration(community.id), 6);
        final stored = (await communityStorage.loadAll()).single;
        expect(stored.pushSubscriptionState.acceptedGeneration, 4);
        expect(stored.pushSubscriptionState.generationCursor, 6);
      },
    );

    test('older lease success cannot regress accepted generation', () async {
      container = createContainer();
      await container.read(communityListProvider.future);
      final subscription = BuzzPushSubscription(
        filter: BuzzPushFilter(kinds: const [9], pTags: ['a' * 64]),
        notificationClass: 'default',
      );
      final community =
          Community.create(
            name: 'Test',
            relayUrl: 'https://test.example.com',
          ).copyWith(
            pushNotificationsEnabled: true,
            pushSubscriptionState: BuzzPushLeaseSubscriptionState.desired(
              desired: [subscription],
            ).withAccepted(subscriptions: [subscription], generation: 6),
          );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(community);

      expect(
        await notifier.markPushLeaseAccepted(
          community.id,
          subscriptions: const [],
          generation: 5,
        ),
        isFalse,
      );

      final stored = (await communityStorage.loadAll()).single;
      expect(stored.pushSubscriptionState.acceptedGeneration, 6);
      expect(
        stored.pushSubscriptionState.accepted!.single.toJson(),
        subscription.toJson(),
      );
    });

    test('lease success cannot accept stale desired subscriptions', () async {
      container = createContainer();
      await container.read(communityListProvider.future);
      final original = BuzzPushSubscription(
        filter: BuzzPushFilter(kinds: const [9], pTags: ['a' * 64]),
        notificationClass: 'default',
      );
      final replacement = BuzzPushSubscription(
        filter: BuzzPushFilter(kinds: const [9], pTags: ['b' * 64]),
        notificationClass: 'default',
      );
      final community =
          Community.create(
            name: 'Test',
            relayUrl: 'https://test.example.com',
          ).copyWith(
            pushNotificationsEnabled: true,
            pushSubscriptionState: BuzzPushLeaseSubscriptionState.desired(
              desired: [original],
            ),
          );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(community);

      final generation = await notifier.reservePushLeaseGeneration(
        community.id,
      );
      await notifier.updateDesiredPushSubscriptions(community.id, [
        replacement,
      ]);

      expect(
        await notifier.markPushLeaseAccepted(
          community.id,
          subscriptions: [original],
          generation: generation,
        ),
        isFalse,
      );

      final stored = (await communityStorage.loadAll()).single;
      expect(stored.pushSubscriptionState.accepted, isNull);
      expect(
        stored.pushSubscriptionState.desired.single.toJson(),
        replacement.toJson(),
      );
    });

    test('opt-out tombstones an in-flight first publication', () async {
      container = createContainer();
      await container.read(communityListProvider.future);
      final subscription = BuzzPushSubscription(
        filter: BuzzPushFilter(kinds: const [9], pTags: ['a' * 64]),
        notificationClass: 'default',
      );
      final community =
          Community.create(
            name: 'Test',
            relayUrl: 'https://test.example.com',
          ).copyWith(
            pushNotificationsEnabled: true,
            pushSubscriptionState: BuzzPushLeaseSubscriptionState.desired(
              desired: [subscription],
            ),
          );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(community);

      expect(await notifier.reservePushLeaseGeneration(community.id), 1);
      await notifier.setPushNotificationsEnabled(community.id, false);
      await notifier.markPushLeaseAccepted(
        community.id,
        subscriptions: [subscription],
        generation: 1,
      );

      final stored = (await communityStorage.loadAll()).single;
      expect(stored.pushNotificationsEnabled, isFalse);
      expect(stored.pushSubscriptionState.acceptedGeneration, 2);
      expect(stored.pushSubscriptionState.generationCursor, 2);
      expect(stored.pushSubscriptionState.pendingTombstoneGeneration, isNull);
      expect(deactivationGenerations, [2]);
    });

    test('opt-out persists first and publishes a higher tombstone', () async {
      container = createContainer();
      await container.read(communityListProvider.future);
      final subscription = BuzzPushSubscription(
        filter: BuzzPushFilter(kinds: const [9], pTags: ['a' * 64]),
        notificationClass: 'default',
      );
      final community =
          Community.create(
            name: 'Test',
            relayUrl: 'https://test.example.com',
          ).copyWith(
            pushNotificationsEnabled: true,
            pushSubscriptionState: BuzzPushLeaseSubscriptionState.desired(
              desired: [subscription],
            ).withAccepted(subscriptions: [subscription], generation: 7),
          );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(community);

      await notifier.setPushNotificationsEnabled(community.id, false);

      final stored = (await communityStorage.loadAll()).single;
      expect(stored.pushNotificationsEnabled, isFalse);
      expect(stored.pushSubscriptionState.generationCursor, 8);
      expect(stored.pushSubscriptionState.acceptedGeneration, 8);
      expect(stored.pushSubscriptionState.pendingTombstoneGeneration, isNull);
      expect(deactivatedCommunityIds, [community.id]);
      expect(deactivationGenerations, [8]);

      container.dispose();
      container = createContainer();
      expect(
        (await container.read(
          communityListProvider.future,
        )).single.pushNotificationsEnabled,
        isFalse,
      );
    });

    test(
      'failed opt-out tombstone retries after restart at a newer generation',
      () async {
        var failTombstone = true;
        deactivator = (community, {generation}) async {
          deactivatedCommunityIds.add(community.id);
          deactivationGenerations.add(generation);
          if (failTombstone) {
            throw StateError('injected tombstone failure');
          }
        };
        container = createContainer();
        await container.read(communityListProvider.future);
        final subscription = BuzzPushSubscription(
          filter: BuzzPushFilter(kinds: const [9], pTags: ['a' * 64]),
          notificationClass: 'default',
        );
        final community =
            Community.create(
              name: 'Test',
              relayUrl: 'https://test.example.com',
            ).copyWith(
              pushNotificationsEnabled: true,
              pushSubscriptionState: BuzzPushLeaseSubscriptionState.desired(
                desired: [subscription],
              ).withAccepted(subscriptions: [subscription], generation: 7),
            );
        await container
            .read(communityListProvider.notifier)
            .addCommunity(community);

        await container
            .read(communityListProvider.notifier)
            .setPushNotificationsEnabled(community.id, false);

        var stored = (await communityStorage.loadAll()).single;
        expect(stored.pushNotificationsEnabled, isFalse);
        expect(stored.pushSubscriptionState.acceptedGeneration, 7);
        expect(stored.pushSubscriptionState.pendingTombstoneGeneration, 8);
        expect(deactivationGenerations, [8]);

        container.dispose();
        failTombstone = false;
        container = createContainer();
        await container.read(communityListProvider.future);
        await container
            .read(communityListProvider.notifier)
            .retryPendingPushLeaseTombstone(
              community.id,
              advanceGeneration: true,
            );

        stored = (await communityStorage.loadAll()).single;
        expect(stored.pushNotificationsEnabled, isFalse);
        expect(stored.pushSubscriptionState.acceptedGeneration, 9);
        expect(stored.pushSubscriptionState.generationCursor, 9);
        expect(stored.pushSubscriptionState.pendingTombstoneGeneration, isNull);
        expect(deactivationGenerations, [8, 9]);
      },
    );

    test('removeCommunity removes from list', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws = Community.create(
        name: 'Test',
        relayUrl: 'https://test.example.com',
      );
      await container.read(communityListProvider.notifier).addCommunity(ws);
      await container
          .read(communityListProvider.notifier)
          .removeCommunity(ws.id);

      final communities = await container.read(communityListProvider.future);
      expect(communities, isEmpty);
      expect(journaledCommunityIds, [ws.id]);
      expect(deactivatedCommunityIds, isEmpty);
      expect(revocationTriggers, 1);
    });

    test('remote tombstone attempt cannot block local removal', () async {
      final remoteAttempt = Completer<void>();
      revocationTrigger = () {
        revocationTriggers += 1;
        return remoteAttempt.future;
      };
      container = createContainer();
      await container.read(communityListProvider.future);
      final community = Community.create(
        name: 'Test',
        relayUrl: 'https://test.example.com',
      );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(community);

      await notifier.removeCommunity(community.id);

      expect(await communityStorage.loadAll(), isEmpty);
      expect(journaledCommunityIds, [community.id]);
      expect(revocationTriggers, 1);
      remoteAttempt.complete();
    });

    test('journal persistence failure keeps community credentials', () async {
      container = ProviderContainer(
        overrides: [
          offlineDirectoryProvider.overrideWithValue(() async => offlineRoot),
          communityStorageProvider.overrideWithValue(communityStorage),
          communitySnapshotWriterProvider.overrideWithValue((_) async {}),
          communityPushLeaseRevocationEnqueuerProvider.overrideWithValue((
            _,
          ) async {
            throw StateError('secure storage unavailable');
          }),
          communityPushLeaseRevocationTriggerProvider.overrideWithValue(
            () async {},
          ),
        ],
      );
      await container.read(communityListProvider.future);
      final community = Community.create(
        name: 'Test',
        relayUrl: 'https://test.example.com',
      );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(community);

      await expectLater(
        notifier.removeCommunity(community.id),
        throwsStateError,
      );

      expect(
        (await communityStorage.loadAll()).map((item) => item.id),
        contains(community.id),
      );
    });

    test(
      'waits for transition teardown before removing active community',
      () async {
        container = createContainer();
        await container.read(communityListProvider.future);

        final ws1 = Community.create(
          name: 'One',
          relayUrl: 'https://one.example.com',
        );
        final ws2 = Community.create(
          name: 'Two',
          relayUrl: 'https://two.example.com',
        );
        final notifier = container.read(communityListProvider.notifier);
        await notifier.addCommunity(ws1);
        await notifier.addCommunity(ws2);
        await notifier.switchCommunity(ws1.id);
        final teardown = Completer<void>();
        container
            .read(communityTransitionProvider)
            .register(() => teardown.future);

        final removing = notifier.removeCommunity(ws1.id);
        await Future<void>.delayed(Duration.zero);

        expect(await communityStorage.loadActiveId(), ws1.id);
        expect(
          (await communityStorage.loadAll()).map((community) => community.id),
          contains(ws1.id),
        );
        teardown.complete();
        await removing;
        expect(await communityStorage.loadActiveId(), ws2.id);
        expect(
          (await communityStorage.loadAll()).map((community) => community.id),
          isNot(contains(ws1.id)),
        );
      },
    );

    test('renameCommunity updates name', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws = Community.create(
        name: 'Original',
        relayUrl: 'https://test.example.com',
      );
      await container.read(communityListProvider.notifier).addCommunity(ws);
      await container
          .read(communityListProvider.notifier)
          .renameCommunity(ws.id, 'Renamed');

      final communities = await container.read(communityListProvider.future);
      expect(communities.first.name, 'Renamed');
    });

    test('waits for transition teardown before updating active ID', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws1 = Community.create(
        name: 'One',
        relayUrl: 'https://one.example.com',
      );
      final ws2 = Community.create(
        name: 'Two',
        relayUrl: 'https://two.example.com',
      );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(ws1);
      await notifier.addCommunity(ws2);
      await notifier.switchCommunity(ws1.id);
      final teardown = Completer<void>();
      container
          .read(communityTransitionProvider)
          .register(() => teardown.future);

      final switching = notifier.switchCommunity(ws2.id);
      await Future<void>.delayed(Duration.zero);

      expect(await communityStorage.loadActiveId(), ws1.id);
      teardown.complete();
      await switching;
      expect(await communityStorage.loadActiveId(), ws2.id);
    });

    test('overlapping transitions share one callback run', () async {
      container = createContainer();
      final coordinator = container.read(communityTransitionProvider);
      final teardown = Completer<void>();
      var calls = 0;
      coordinator.register(() {
        calls++;
        return teardown.future;
      });

      var firstCompleted = false;
      var secondCompleted = false;
      final first = coordinator.run().then((_) => firstCompleted = true);
      final second = coordinator.run().then((_) => secondCompleted = true);
      await Future<void>.delayed(Duration.zero);

      expect(calls, 1);
      expect(firstCompleted, isFalse);
      expect(secondCompleted, isFalse);
      teardown.complete();
      await Future.wait([first, second]);
      expect(firstCompleted, isTrue);
      expect(secondCompleted, isTrue);
    });

    test('a later transition starts a new callback run', () async {
      container = createContainer();
      final coordinator = container.read(communityTransitionProvider);
      var calls = 0;
      coordinator.register(() async => calls++);

      await coordinator.run();
      await coordinator.run();

      expect(calls, 2);
    });

    test(
      'transition callback failure does not block the active ID update',
      () async {
        container = createContainer();
        await container.read(communityListProvider.future);

        final ws1 = Community.create(
          name: 'One',
          relayUrl: 'https://one.example.com',
        );
        final ws2 = Community.create(
          name: 'Two',
          relayUrl: 'https://two.example.com',
        );
        final notifier = container.read(communityListProvider.notifier);
        await notifier.addCommunity(ws1);
        await notifier.addCommunity(ws2);
        await notifier.switchCommunity(ws1.id);
        container.read(communityTransitionProvider).register(() async {
          throw StateError('native cleanup failed');
        });

        await notifier.switchCommunity(ws2.id);

        expect(await communityStorage.loadActiveId(), ws2.id);
      },
    );

    test('switchCommunity updates active ID', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws1 = Community.create(
        name: 'One',
        relayUrl: 'https://one.example.com',
      );
      final ws2 = Community.create(
        name: 'Two',
        relayUrl: 'https://two.example.com',
      );

      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(ws1);
      await notifier.addCommunity(ws2);
      await notifier.switchCommunity(ws2.id);

      final activeId = await communityStorage.loadActiveId();
      expect(activeId, ws2.id);
    });
  });

  group('activeCommunityProvider', () {
    test('returns null when no communities', () async {
      container = createContainer();
      final active = await container.read(activeCommunityProvider.future);
      expect(active, isNull);
    });

    test('returns community matching active ID', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws = Community.create(
        name: 'Test',
        relayUrl: 'https://test.example.com',
      );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(ws);
      await notifier.switchCommunity(ws.id);

      final active = await container.read(activeCommunityProvider.future);
      expect(active, isNotNull);
      expect(active!.id, ws.id);
      expect(active.name, 'Test');
    });

    test('falls back without persisting when active ID is missing', () async {
      final community = Community.create(
        name: 'Fallback',
        relayUrl: 'https://test.example.com',
      );
      await communityStorage.save(community);
      container = createContainer();

      final active = await container.read(activeCommunityProvider.future);
      expect(active?.id, community.id);
      expect(await communityStorage.loadActiveId(), isNull);
    });

    test('falls back to first community if active ID is invalid', () async {
      container = createContainer();
      await container.read(communityListProvider.future);

      final ws = Community.create(
        name: 'Fallback',
        relayUrl: 'https://test.example.com',
      );
      final notifier = container.read(communityListProvider.notifier);
      await notifier.addCommunity(ws);

      // Set an invalid active ID.
      await communityStorage.saveActiveId('nonexistent-id');

      // Re-read — should fall back.
      container.invalidate(activeCommunityProvider);
      final active = await container.read(activeCommunityProvider.future);
      expect(active, isNotNull);
      expect(active!.id, ws.id);
      expect(await communityStorage.loadActiveId(), 'nonexistent-id');
    });
  });
}

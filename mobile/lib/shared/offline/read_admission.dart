import 'package:flutter/widgets.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import '../relay/relay.dart';
import 'offline_provider.dart';

class OfflineSource {
  final bool live;
  final int? savedAt;
  final int? generation;
  const OfflineSource({this.live = false, this.savedAt, this.generation});
}

class OfflineSourceNotifier extends Notifier<OfflineSource> {
  final String id;
  OfflineSourceNotifier(this.id);
  @override
  OfflineSource build() {
    ref.watch(relayConfigProvider);
    return const OfflineSource();
  }

  void cached(int savedAt) => state = OfflineSource(savedAt: savedAt);
  void authoritative(int generation) => state = OfflineSource(
    live: true,
    savedAt: DateTime.now().millisecondsSinceEpoch,
    generation: generation,
  );
}

final offlineSourceProvider =
    NotifierProvider.family<OfflineSourceNotifier, OfflineSource, String>(
      OfflineSourceNotifier.new,
    );

/// Cached reading never advances receipts, including on the first connected frame.
final readAdmissionProvider = Provider.family<bool, String>((ref, sourceId) {
  if (!ref.watch(offlineEnabledProvider)) return true;
  final source = ref.watch(offlineSourceProvider(sourceId));
  return ref.watch(networkAvailableProvider) &&
      ref.watch(relaySessionProvider).status == SessionStatus.connected &&
      ref.watch(appLifecycleProvider) == AppLifecycleState.resumed &&
      source.live &&
      source.generation ==
          ref.read(relaySessionProvider.notifier).connectionGeneration;
});

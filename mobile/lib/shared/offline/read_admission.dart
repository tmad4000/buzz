import 'package:flutter/widgets.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import '../relay/relay.dart';
import 'offline_provider.dart';

class OfflineSource {
  final bool live;
  final int? savedAt;
  final int? generation;
  final bool truncated;
  final int networkGeneration;
  const OfflineSource({
    this.live = false,
    this.savedAt,
    this.generation,
    this.truncated = false,
    this.networkGeneration = 0,
  });
}

class OfflineSourceNotifier extends Notifier<OfflineSource> {
  final String id;
  OfflineSourceNotifier(this.id);
  @override
  OfflineSource build() {
    ref.watch(relayConfigProvider);
    return const OfflineSource();
  }

  void cached(int savedAt, {bool truncated = false}) =>
      state = OfflineSource(savedAt: savedAt, truncated: truncated);
  void authoritative(int generation, {int networkGeneration = 0}) =>
      state = OfflineSource(
        live: true,
        savedAt: DateTime.now().millisecondsSinceEpoch,
        generation: generation,
        networkGeneration: networkGeneration,
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
      source.networkGeneration ==
          ref.read(networkAvailableProvider.notifier).generation &&
      source.generation ==
          ref.read(relaySessionProvider.notifier).connectionGeneration;
});

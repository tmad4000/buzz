import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import '../relay/relay.dart';
import 'offline_provider.dart';
import 'read_admission.dart';

/// Nonblocking cached-source status; its Retry action has one semantics owner.
class OfflineBanner extends ConsumerWidget {
  final String sourceId;
  final VoidCallback onRetry;
  const OfflineBanner({
    super.key,
    required this.sourceId,
    required this.onRetry,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(offlineEnabledProvider)) return const SizedBox.shrink();
    final source = ref.watch(offlineSourceProvider(sourceId));
    final connected =
        ref.watch(networkAvailableProvider) &&
        ref.watch(relaySessionProvider).status == SessionStatus.connected;
    if (connected && ref.watch(readAdmissionProvider(sourceId))) {
      return const SizedBox.shrink();
    }
    final at = source.savedAt == null
        ? null
        : DateTime.fromMillisecondsSinceEpoch(source.savedAt!).toLocal();
    final time = at == null
        ? null
        : '${at.hour.toString().padLeft(2, '0')}:${at.minute.toString().padLeft(2, '0')}';
    final text = connected
        ? 'Back online · refreshing…'
        : time == null
        ? 'Offline · nothing cached for this chat'
        : 'Offline · showing cached as of $time';
    return Semantics(
      liveRegion: true,
      child: Material(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Row(
            children: [
              Expanded(child: Text(text)),
              TextButton(onPressed: onRetry, child: const Text('Retry')),
            ],
          ),
        ),
      ),
    );
  }
}

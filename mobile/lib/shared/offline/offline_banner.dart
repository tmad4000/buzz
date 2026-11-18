import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import '../relay/relay.dart';
import 'offline_provider.dart';
import 'read_admission.dart';

/// Nonblocking cached-source status; its Retry action has one semantics owner.
class OfflineBanner extends ConsumerStatefulWidget {
  final String sourceId;
  final VoidCallback onRetry;
  const OfflineBanner({
    super.key,
    required this.sourceId,
    required this.onRetry,
  });
  @override
  ConsumerState<OfflineBanner> createState() => _OfflineBannerState();
}

class _OfflineBannerState extends ConsumerState<OfflineBanner> {
  bool _wasOffline = false;
  @override
  void didUpdateWidget(covariant OfflineBanner oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.sourceId != widget.sourceId) _wasOffline = false;
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(offlineEnabledProvider)) return const SizedBox.shrink();
    final source = ref.watch(offlineSourceProvider(widget.sourceId));
    final connected =
        ref.watch(networkAvailableProvider) &&
        ref.watch(relaySessionProvider).status == SessionStatus.connected;
    if (!connected) _wasOffline = true;
    if (connected && ref.watch(readAdmissionProvider(widget.sourceId))) {
      if (_wasOffline) {
        _wasOffline = false;
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted || ModalRoute.of(context)?.isCurrent == false) return;
          ScaffoldMessenger.maybeOf(context)?.showSnackBar(
            const SnackBar(
              content: Text('Up to date'),
              duration: Duration(seconds: 4),
            ),
          );
        });
      }
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(child: Text(text)),
                  TextButton(
                    onPressed: widget.onRetry,
                    child: const Text('Retry'),
                  ),
                ],
              ),
              if (source.truncated)
                const Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Showing newest 200 cached replies. Earlier replies load when online.',
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

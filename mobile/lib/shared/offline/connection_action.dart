import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'offline_provider.dart';

/// Retains layout and explains unavailable actions across custom/native-fallback menus.
class OfflineConnectionAction extends ConsumerWidget {
  final Widget child;
  const OfflineConnectionAction({super.key, required this.child});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(offlineConnectionRequiredProvider)) {
      return child;
    }
    return Tooltip(
      message: 'Needs a connection',
      child: Semantics(
        enabled: false,
        label: 'Needs a connection',
        child: ExcludeFocus(
          child: AbsorbPointer(child: Opacity(opacity: 0.45, child: child)),
        ),
      ),
    );
  }
}

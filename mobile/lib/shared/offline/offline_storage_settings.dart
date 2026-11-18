import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'offline_provider.dart';

/// Storage controls appear only in an explicitly opted-in artifact.
class OfflineStorageSettings extends ConsumerWidget {
  const OfflineStorageSettings({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(offlineEnabledProvider)) return const SizedBox.shrink();
    return ListTile(
      title: const Text('Clear cached messages'),
      subtitle: const Text(
        'Encrypted on this device. Attachments are metadata only.',
      ),
      onTap: () async {
        try {
          final store = await ref.read(offlineStoreProvider.future);
          await store?.clear();
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Cached messages cleared')),
            );
          }
        } catch (_) {
          if (context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Could not clear cached messages. Try again.'),
              ),
            );
          }
        }
      },
    );
  }
}

import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:nostr/nostr.dart' as nostr;
import 'package:path_provider/path_provider.dart';

import '../crypto/nip44.dart';
import '../relay/relay.dart';
import 'offline_cache.dart';

/// Explicit opt-in; unchanged builds/tests do not instantiate filesystem or key access.
const offlineFeatureEnabled = bool.fromEnvironment(
  'BUZZ_OFFLINE_CACHE',
  defaultValue: false,
);
final offlineEnabledProvider = Provider<bool>((ref) => offlineFeatureEnabled);

/// The only platform-directory seam; tests replace it with an isolated temporary directory.
final offlineDirectoryProvider = Provider<Future<Directory> Function()>(
  (ref) => () async {
    final support = await getApplicationSupportDirectory();
    return Directory('${support.path}/offline-cache');
  },
);

final offlineStoreProvider = FutureProvider<OfflineCacheStore?>((ref) async {
  if (!ref.watch(offlineEnabledProvider)) return null;
  final config = ref.watch(relayConfigProvider);
  final pubkey = ref.watch(myPubkeyProvider);
  final nsec = config.nsec;
  if (pubkey == null || nsec == null || nsec.isEmpty) return null;
  final root = await ref.read(offlineDirectoryProvider)();
  final key = await compute(_selfKey, (nsec, pubkey));
  if (!ref.mounted) return null;
  return OfflineCacheStore(
    root: root,
    scope: offlineMobileScope(config.wsUrl, pubkey),
    cipher: Nip44OfflineCipher(key),
  );
});
String offlineMobileScope(String relay, String pubkey) {
  final uri = Uri.parse(relay);
  return jsonEncode([
    pubkey.toLowerCase(),
    uri
        .replace(host: uri.host.toLowerCase(), fragment: '')
        .toString()
        .replaceFirst(RegExp(r'/+$'), ''),
  ]);
}

Uint8List _selfKey((String, String) value) =>
    getConversationKey(nostr.Nip19.decode(payload: value.$1).data, value.$2);

/// Immediate fence for actions that have no durable offline queue.
bool offlineConnectionRequired(Ref ref) =>
    ref.read(offlineEnabledProvider) &&
    (!ref.read(networkAvailableProvider) ||
        ref.read(relaySessionProvider).status != SessionStatus.connected);

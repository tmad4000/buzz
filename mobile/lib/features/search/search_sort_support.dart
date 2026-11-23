import 'dart:convert';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:http/http.dart' as http;

import '../../shared/relay/relay.dart';

/// True when NIP-11 says the relay can order search by date (`NOSTR.md`).
bool advertisesSearchSort(Object? info) {
  if (info is! Map) return false;
  final extensions = info['supported_extensions'];
  return extensions is List && extensions.contains('buzz-search-sort');
}

/// Whether the active relay accepts `search_sort`. Errors when the relay cannot
/// be read; callers then narrow windows instead, which needs no support.
final relaySearchSortProvider = FutureProvider<bool>(
  (ref) async {
    final base = ref.watch(relayConfigProvider.select((c) => c.baseUrl));
    final client = http.Client();
    try {
      final response = await client
          .get(
            Uri.parse(base).resolve('/info'),
            headers: const {'Accept': 'application/nostr+json'},
          )
          .timeout(const Duration(seconds: 3));
      if (response.statusCode != 200) {
        throw StateError('NIP-11 request failed (${response.statusCode})');
      }
      return advertisesSearchSort(jsonDecode(response.body));
    } finally {
      client.close();
    }
  },
  // The next search asks again; nothing needs a background retry.
  retry: (_, _) => null,
);

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/relay/relay.dart';

void main() {
  testWidgets(
    'offline attachment uses dimensions and an honest placeholder after failed HTTP cache',
    (tester) async {
      final client = MockClient((_) async => http.Response('', 503));
      addTearDown(client.close);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            offlineEnabledProvider.overrideWithValue(true),
            mediaGetAuthServiceProvider.overrideWithValue(
              MediaGetAuthService(baseUrl: 'https://relay.test', nsec: null),
            ),
            mediaHttpClientProvider.overrideWithValue(client),
            networkAvailableProvider.overrideWith(() => _NoNetwork()),
          ],
          child: const MaterialApp(
            home: SizedBox(
              width: 240,
              height: 120,
              child: MediaImage(
                url: 'https://relay.test/media/offline.jpg',
                offlinePlaceholder: true,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Available when online'), findsOneWidget);
    },
  );
}

class _NoNetwork extends NetworkAvailableNotifier {
  @override
  bool build() => false;
}

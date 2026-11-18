import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:buzz/shared/offline/offline_banner.dart';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/offline/read_admission.dart';
import 'package:buzz/shared/relay/relay.dart';

class BannerSession extends RelaySessionNotifier {
  @override
  SessionState build() =>
      const SessionState(status: SessionStatus.disconnected);
  void connect() {
    state = const SessionState(status: SessionStatus.connected);
  }
}

class BannerLifecycle extends AppLifecycleNotifier {
  @override
  AppLifecycleState build() => AppLifecycleState.resumed;
}

class BannerConfig extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://relay.test');
}

void main() {
  testWidgets(
    'cached banner names truncation and waits for authoritative recovery before toast',
    (tester) async {
      final session = BannerSession();
      final container = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          relayConfigProvider.overrideWith(BannerConfig.new),
          relaySessionProvider.overrideWith(() => session),
          appLifecycleProvider.overrideWith(BannerLifecycle.new),
        ],
      );
      addTearDown(container.dispose);
      final source = container.read(
        offlineSourceProvider('thread:test').notifier,
      );
      source.cached(1000, truncated: true);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(
              body: OfflineBanner(sourceId: 'thread:test', onRetry: () {}),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(
        find.textContaining('Offline · showing cached as of'),
        findsOneWidget,
      );
      expect(
        find.textContaining('Showing newest 200 cached replies'),
        findsOneWidget,
      );
      session.connect();
      await tester.pump();
      expect(find.text('Back online · refreshing…'), findsOneWidget);
      expect(find.text('Up to date'), findsNothing);
      source.authoritative(session.connectionGeneration);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('showing cached as of'), findsNothing);
      expect(find.text('Up to date'), findsOneWidget);
    },
  );
}

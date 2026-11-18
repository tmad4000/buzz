import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:buzz/shared/offline/offline_provider.dart';
import 'package:buzz/shared/offline/read_admission.dart';
import 'package:buzz/shared/relay/relay.dart';

class OfflineSession extends RelaySessionNotifier {
  @override
  SessionState build() =>
      const SessionState(status: SessionStatus.disconnected);
  void status(SessionStatus status) {
    state = SessionState(status: status);
  }
}

class Foreground extends AppLifecycleNotifier {
  @override
  AppLifecycleState build() => AppLifecycleState.resumed;
  void hidden() {
    state = AppLifecycleState.hidden;
  }
}

class Config extends RelayConfigNotifier {
  @override
  RelayConfig build() => const RelayConfig(baseUrl: 'https://relay.test');
}

void main() {
  test(
    'cached reading and connected-before-fetch cannot advance admission; scope and generation are fenced',
    () {
      final session = OfflineSession();
      final lifecycle = Foreground();
      final container = ProviderContainer(
        overrides: [
          offlineEnabledProvider.overrideWithValue(true),
          relaySessionProvider.overrideWith(() => session),
          appLifecycleProvider.overrideWith(() => lifecycle),
          relayConfigProvider.overrideWith(Config.new),
        ],
      );
      addTearDown(container.dispose);
      const source = 'head:general';
      final gate = readAdmissionProvider(source);
      container.listen(gate, (_, _) {}, fireImmediately: true);
      final origin = container.read(offlineSourceProvider(source).notifier);
      origin.cached(1000);
      expect(container.read(gate), isFalse);
      session.status(SessionStatus.connected);
      expect(container.read(gate), isFalse);
      origin.authoritative(session.connectionGeneration);
      expect(container.read(gate), isTrue);
      session.status(SessionStatus.reconnecting);
      expect(container.read(gate), isFalse);
      session.debugSupersedeConnection();
      session.status(SessionStatus.connected);
      expect(container.read(gate), isFalse);
      origin.authoritative(session.connectionGeneration);
      expect(container.read(gate), isTrue);
      container.read(networkAvailableProvider.notifier).update(false);
      expect(container.read(gate), isFalse);
      container.read(networkAvailableProvider.notifier).update(true);
      expect(container.read(gate), isFalse);
      origin.authoritative(
        session.connectionGeneration,
        networkGeneration: container
            .read(networkAvailableProvider.notifier)
            .generation,
      );
      expect(container.read(gate), isTrue);
      lifecycle.hidden();
      expect(container.read(gate), isFalse);
      container
          .read(relayConfigProvider.notifier)
          .update(baseUrl: 'https://other.test');
      expect(container.read(offlineSourceProvider(source)).live, isFalse);
      expect(container.read(gate), isFalse);
    },
  );
  test('feature defaults off', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);
    expect(container.read(offlineEnabledProvider), isFalse);
  });
}

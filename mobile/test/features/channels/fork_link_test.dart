import 'package:buzz/features/channels/message_content.dart';
import 'package:buzz/features/channels/message_content/link_normalizer.dart';
import 'package:buzz/shared/deeplink/deep_link.dart';
import 'package:buzz/shared/deeplink/pending_deep_link_provider.dart';
import 'package:buzz/shared/theme/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';

void main() {
  const channel = '580ca78b-9dae-46f3-8854-bd671853ba32';
  const event =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const configured = String.fromEnvironment(
    'BUZZ_URL_SCHEME',
    defaultValue: 'buzz',
  );
  final schemes = <String>{'buzz'}..add(configured);
  for (final scheme in schemes) {
    final url = '$scheme://message?channel=$channel&id=$event';
    test('normalizes $scheme links without swallowing punctuation or code', () {
      expect(
        normalizeBareLinks('**$url**. and <$url>'),
        '**[$url]($url)**. and [$url]($url)',
      );
      expect(normalizeBareLinks('`$url`'), '`$url`');
    });
    testWidgets(
      'renders and taps a $scheme message link through the dispatcher',
      (tester) async {
        await tester.pumpWidget(
          ProviderScope(
            child: MaterialApp(
              theme: AppTheme.light(),
              builder: (context, child) => AppMarkdownTheme(child: child!),
              home: Scaffold(body: MessageContent(content: 'See $url now')),
            ),
          ),
        );
        final chip = find.byKey(ValueKey('buzz-link-chip:$url'));
        expect(chip, findsOneWidget);
        await tester.tap(chip);
        await tester.pump();
        final container = ProviderScope.containerOf(
          tester.element(find.byType(MessageContent)),
        );
        expect(
          container.read(pendingDeepLinkProvider),
          const MessageDeepLink(channelId: channel, messageId: event),
        );
      },
    );
  }
}

import 'package:buzz/shared/deeplink/deep_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const channel = '580ca78b-9dae-46f3-8854-bd671853ba32';
  const event =
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const configured = String.fromEnvironment(
    'BUZZ_URL_SCHEME',
    defaultValue: 'buzz',
  );

  test(
    'distribution links use its registered scheme and retain canonical input',
    () {
      final link = buildMessageLink(channelId: channel, messageId: event);
      expect(Uri.parse(link).scheme, configured);
      expect(parseMessageDeepLink(Uri.parse(link))?.messageId, event);
      expect(
        parseMessageDeepLink(
          Uri.parse('buzz://message?channel=$channel&id=$event'),
        )?.messageId,
        event,
      );
      expect(
        parseChannelDeepLink(
          Uri.parse('$configured://channel/$channel'),
        )?.channelId,
        channel,
      );
      expect(
        parseBuzzDeepLink(
          Uri.parse('$configured://message?channel=$channel&id=$event'),
        ),
        isA<MessageDeepLink>(),
      );
    },
  );

  test('an unrelated URI scheme is not a Buzz navigation target', () {
    expect(
      parseMessageDeepLink(
        Uri.parse('other-app://message?channel=$channel&id=$event'),
      ),
      isNull,
    );
    expect(
      parseChannelDeepLink(Uri.parse('other-app://channel/$channel')),
      isNull,
    );
  });
}

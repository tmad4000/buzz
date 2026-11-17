import 'dart:convert';
import 'package:buzz/features/settings/app_version_stamp.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

class _BuildAsset extends CachingAssetBundle {
  @override
  Future<ByteData> load(String key) async {
    final bytes = utf8.encode(
      jsonEncode({
        'version': '1.2.3',
        'commit': '123456789abcdef',
        'commitTime': DateTime.now()
            .subtract(const Duration(minutes: 5))
            .toUtc()
            .toIso8601String(),
        'event': 'commit',
      }),
    );
    return ByteData.sublistView(Uint8List.fromList(bytes));
  }
}

void main() {
  testWidgets('native stamp reveals exact commit on tap', (tester) async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler(
          'flutter/assets',
          (message) async => _BuildAsset().load('assets/app-version.json'),
        );
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: AppVersionStamp(version: '1.2.3')),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('Updated 5m ago'), findsOneWidget);
    await tester.tap(find.byType(TextButton));
    await tester.pump();
    expect(find.textContaining('commit 123456789'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMessageHandler('flutter/assets', null);
  });
}

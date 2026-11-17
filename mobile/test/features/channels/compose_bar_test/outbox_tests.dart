part of '../compose_bar_test.dart';

void outboxTests() {
  testWidgets(
    'durable handoff keeps text until commit then accepts another draft',
    (tester) async {
      final commit = Completer<void>();
      final captured = <String>[];
      await tester.pumpWidget(
        _buildComposeBar(
          uploadService: _testUploadService(nostr.Keys.generate().nsec),
          onSend: (_, _, {mediaTags = const []}) async {
            fail('Legacy publisher used');
          },
          onQueue:
              (
                text,
                _, {
                mediaTags = const [],
                attachments = const [],
                mentionKeys = const {},
              }) async {
                captured.add(text);
                await commit.future;
              },
        ),
      );
      await _expandComposer(tester);
      await tester.enterText(find.byType(TextField), 'keep until disk commit');
      await tester.pump();
      final tap = tester
          .widget<IconButton>(
            find.widgetWithIcon(IconButton, BuzzIcons.arrowUp),
          )
          .onPressed!;
      tap();
      await tester.pump();
      await tester.pump();
      expect(captured, ['keep until disk commit']);
      expect(find.text('keep until disk commit'), findsWidgets);
      // A queued second invocation cannot reserve another message.
      tap();
      await tester.pump();
      expect(captured, hasLength(1));
      commit.complete();
      await tester.pumpAndSettle();
      expect(find.text('keep until disk commit'), findsNothing);
      await tester.enterText(find.byType(TextField), 'next message');
      expect(find.text('next message'), findsOneWidget);
    },
  );

  testWidgets('failed durable commit keeps the draft for retry', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildComposeBar(
        uploadService: _testUploadService(nostr.Keys.generate().nsec),
        onSend: (_, _, {mediaTags = const []}) async {},
        onQueue:
            (
              _,
              _, {
              mediaTags = const [],
              attachments = const [],
              mentionKeys = const {},
            }) async {
              throw const FileSystemException('disk unavailable');
            },
      ),
    );
    await _expandComposer(tester);
    await tester.enterText(find.byType(TextField), 'never lose this');
    await tester.pump();
    await tester.tap(find.byIcon(BuzzIcons.arrowUp));
    await tester.pumpAndSettle();
    expect(find.text('never lose this'), findsOneWidget);
    expect(find.textContaining('disk unavailable'), findsOneWidget);
  });

  testWidgets(
    'detached handoff retains originals until committed copying completes',
    (tester) async {
      final started = Completer<List<OutboxAttachment>>();
      final commit = Completer<void>();
      final service = MediaUploadService(
        baseUrl: 'https://relay.example',
        nsec: nostr.Keys.generate().nsec,
        pickGalleryImage: () async => null,
        pickGalleryVideo: () async => null,
        pickGalleryImages: () async => [
          XFile.fromData(_pngBytes, name: 'owned.png'),
        ],
      );
      await tester.pumpWidget(
        _buildComposeBar(
          uploadService: service,
          onSend: (_, _, {mediaTags = const []}) async {},
          onQueue:
              (
                text,
                _, {
                mediaTags = const [],
                attachments = const [],
                mentionKeys = const {},
              }) async {
                started.complete(attachments);
                await commit.future;
                expect(await attachments.single.file.readAsBytes(), _pngBytes);
              },
        ),
      );
      await _openSystemPhotoPicker(tester);
      await tester.pumpAndSettle();
      await _expandComposer(tester);
      await tester.tap(find.byIcon(BuzzIcons.arrowUp));
      await tester.pump();
      await tester.pump();
      final files = await started.future;
      expect(OutboxFileLease.owns(files.single.file.path), isTrue);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.runAsync(() async {
        expect(await files.single.file.readAsBytes(), _pngBytes);
      });
      commit.complete();
      await tester.pump();
      await tester.pump();
      await tester.runAsync(() async {
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      expect(OutboxFileLease.owns(files.single.file.path), isFalse);
    },
  );
}

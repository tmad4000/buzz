part of '../compose_bar.dart';

typedef _DurableDraft = ({
  Map<String, String> keys,
  List<String> pubkeys,
  List<List<String>> tags,
  Future<void> Function() retire,
});

/// Cleanup belongs to this captured handoff before any asynchronous preparation.
Future<void> _handoffDurableDraft({
  required BuildContext context,
  required ComposeBarOnQueue queue,
  required String text,
  required List<_PendingAttachment> attachments,
  required OutboxFileLease lease,
  required bool Function() isDraftCurrent,
  required VoidCallback clearComposer,
  required _DurableDraft draft,
  required Future<_DurableDraft?> Function() prepare,
}) async {
  try {
    final files = [
      for (final file in attachments)
        OutboxAttachment(file.file, file.kind.name, duration: file.duration),
    ];
    Future<void> commit() => queue(
      text,
      draft.pubkeys,
      attachments: files,
      mediaTags: draft.tags,
      mentionKeys: draft.keys,
      prepare: () async {
        final prepared = await prepare();
        return prepared == null
            ? null
            : {
                'mentions': prepared.pubkeys,
                'mediaTags': prepared.tags,
                'mentionKeys': prepared.keys,
              };
      },
    );
    Future<void> detachedCommitted() async {
      try {
        await draft.retire();
      } finally {
        lease.release();
        await _deleteOwnedAttachments(attachments);
      }
    }

    try {
      await commit();
    } on OutboxNeedsReview {
      // This is a durable paused row, not a failed copy. Never enqueue it again.
    } catch (_) {
      if (!context.mounted) {
        unawaited(
          recoverDetachedOutboxCapture(
            commit: () async {
              try {
                await commit();
              } on OutboxNeedsReview {
                // A retry finished copying but could not finish preparation.
              }
            },
            committed: detachedCommitted,
          ),
        );
        return;
      }
      rethrow;
    }
    if (context.mounted && isDraftCurrent()) {
      clearComposer();
      lease.release();
      await _deleteOwnedAttachments(attachments);
    } else if (!context.mounted) {
      await detachedCommitted();
    } else {
      lease.release();
    }
  } catch (_) {
    lease.release();
    rethrow;
  }
}

void _useInitialOutboxAttachments(
  ValueNotifier<List<_PendingAttachment>> attachments,
  List<OutboxAttachment> initialAttachments,
) {
  useEffect(() {
    if (initialAttachments.isNotEmpty) {
      attachments.value = [
        for (final attachment in initialAttachments)
          _PendingAttachment(
            file: attachment.file,
            kind: _PendingAttachmentKind.values.byName(attachment.kind),
            duration: attachment.duration,
          ),
      ];
    }
    return null;
  }, const []);
}

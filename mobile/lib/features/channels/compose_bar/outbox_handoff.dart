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
  required Future<_DurableDraft?> Function() prepare,
}) async {
  try {
    final draft = await prepare();
    if (draft == null) {
      lease.release();
      if (!context.mounted) await _deleteOwnedAttachments(attachments);
      return;
    }
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
    } catch (_) {
      if (!context.mounted) {
        unawaited(
          recoverDetachedOutboxCapture(
            commit: commit,
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

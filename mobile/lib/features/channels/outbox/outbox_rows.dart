import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../shared/relay/relay.dart';
import '../../activity/compose_drafts_provider.dart';
import '../compose_bar.dart';
import 'message_outbox.dart';
import 'outbox_provider.dart';

/// Pending rows stay visible after failure; a composer owns none of their bytes.
class OutboxRows extends ConsumerWidget {
  final String channelId;
  final String? parentId;
  final String? rootId;
  const OutboxRows({
    super.key,
    required this.channelId,
    this.parentId,
    this.rootId,
  });
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final value = ref.watch(messageOutboxProvider);
    return value.when(
      loading: () => const SizedBox.shrink(),
      error: (error, _) => Text('Outbox unavailable: $error'),
      data: (outbox) => ListenableBuilder(
        listenable: outbox,
        builder: (context, _) {
          final config = ref.watch(relayConfigProvider);
          final author = SignedEventRelay(
            session: ref.read(relaySessionProvider.notifier),
            nsec: config.nsec,
          ).pubkey;
          final all = outbox.items
              .where(
                (item) => item.relay == config.baseUrl && item.author == author,
              )
              .toList();
          final visible = all
              .where(
                (item) =>
                    item.channelId == channelId &&
                    (item.rootId ?? item.parentId) == (rootId ?? parentId),
              )
              .toList();
          if (all.isEmpty && outbox.storageError == null) {
            return const SizedBox.shrink();
          }
          return ConstrainedBox(
            constraints: const BoxConstraints(maxHeight: 240),
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    outbox.storageError ?? '${all.length} waiting to send',
                    style: Theme.of(context).textTheme.labelSmall,
                  ),
                  for (final row in visible)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                SizedBox(
                                  width: 18,
                                  height: 18,
                                  child: CircularProgressIndicator(
                                    value: outbox.progress[row.id],
                                    strokeWidth: 2,
                                    semanticsLabel:
                                        'Attachment upload progress',
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Expanded(
                                  child: Text(
                                    row.data['needsReview'] == true
                                        ? 'Review before sending — saved here'
                                        : row.state == 'editing'
                                        ? 'Editing — send paused'
                                        : row.error != null
                                        ? 'Waiting to retry'
                                        : 'Sending…',
                                  ),
                                ),
                              ],
                            ),
                            if (row.text.isNotEmpty)
                              Text(
                                row.text,
                                maxLines: 3,
                                overflow: TextOverflow.ellipsis,
                              ),
                            if (row.attachments.isNotEmpty)
                              Text(
                                '${row.attachments.length} attachment(s)',
                                style: Theme.of(context).textTheme.bodySmall,
                              ),
                            if (row.error case final error?)
                              Text(
                                error,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            Wrap(
                              children: [
                                TextButton(
                                  onPressed:
                                      row.data['needsReview'] == true ||
                                          outbox.publishing.contains(row.id)
                                      ? null
                                      : () => _action(
                                          context,
                                          () => outbox.retry(row.id),
                                        ),
                                  child: const Text('Retry'),
                                ),
                                TextButton(
                                  onPressed:
                                      row.uncertain ||
                                          outbox.publishing.contains(row.id)
                                      ? null
                                      : () => _edit(context, ref, outbox, row),
                                  child: Text(
                                    row.data['needsReview'] == true
                                        ? 'Review'
                                        : 'Edit',
                                  ),
                                ),
                                TextButton(
                                  onPressed: outbox.publishing.contains(row.id)
                                      ? null
                                      : () => _action(
                                          context,
                                          () => outbox.remove(row.id),
                                        ),
                                  child: const Text('Delete'),
                                ),
                              ],
                            ),
                            if (row.uncertain)
                              const Text(
                                'Retry checks whether this message was delivered before editing.',
                              ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _action(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    try {
      await action();
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('$error')));
      }
    }
  }

  Future<void> _edit(
    BuildContext context,
    WidgetRef ref,
    MessageOutbox outbox,
    OutboxItem row,
  ) async {
    await _action(context, () async {
      final paused = await outbox.pause(row.id);
      if (!context.mounted) return;
      final key = 'outbox-edit:${paused.id}';
      // This is an isolated normal composer draft, with exact picker bindings.
      final drafts = ref.read(composeDraftsProvider.notifier);
      if (drafts.draftFor(key) == null) {
        drafts.save(
          key: key,
          channelId: row.channelId,
          threadHeadId: row.parentId,
          text: row.text,
          mentionKeys: (row.data['mentionKeys'] as Map).cast<String, String>(),
        );
      }
      await showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (sheetContext) => Padding(
          padding: EdgeInsets.only(
            bottom: MediaQuery.viewInsetsOf(sheetContext).bottom,
          ),
          child: SafeArea(
            child: ComposeBar(
              channelId: row.channelId,
              threadHeadId: row.parentId,
              rootId: row.rootId,
              draftKeyOverride: key,
              showOutbox: false,
              initialAttachments: [
                for (final attachment in row.attachments)
                  OutboxAttachment(
                    XFile(
                      attachment['path'] as String,
                      name: attachment['name'] as String,
                    ),
                    attachment['kind'] as String,
                    duration: attachment['durationMs'] == null
                        ? null
                        : Duration(
                            milliseconds: attachment['durationMs'] as int,
                          ),
                  ),
              ],
              onSend: (_, _, {mediaTags = const []}) async {},
              onQueue:
                  (
                    text,
                    mentions, {
                    mediaTags = const [],
                    attachments = const [],
                    mentionKeys = const {},
                    prepare,
                  }) async {
                    await outbox.edit(
                      paused,
                      {
                        'text': text,
                        'mentions': mentions,
                        'mediaTags': mediaTags,
                        'mentionKeys': mentionKeys,
                      },
                      attachments,
                      prepare: prepare,
                    );
                    if (sheetContext.mounted) Navigator.of(sheetContext).pop();
                  },
            ),
          ),
        ),
      );
      // Dismissal deliberately leaves this row paused; no partially edited send.
    });
  }
}

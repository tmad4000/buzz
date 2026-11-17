import { DraftEditorPresentationContext } from "@/features/conversations/ConversationDraftEditors";
import { toast } from "sonner";
import { messageMentionPubkeys } from "../lib/messageMentionPubkeys";
import { MessageComposer } from "../ui/MessageComposer";
import { loadDraftEntry, persistDraftEntry } from "../lib/useDrafts";
import {
  imetaMediaFromTags,
  stripImetaMediaLines,
  findSpoileredImetaMediaUrls,
} from "../lib/imetaMediaMarkdown";
import { saveQueuedAttachmentsForDraft } from "../lib/backgroundMediaUploadStore";
import { beginOutboxEdit, cancelOutboxEdit, editOutbox } from "./runtime";
import type { OutboxRecord } from "./types";

export const outboxEditKey = (id: string): string => `outbox-edit:${id}`;

/** Editing pauses the original row before acquiring a separate draft key. */
export async function prepareOutboxEditor(id: string): Promise<void> {
  const row = await beginOutboxEdit(id);
  const key = outboxEditKey(id);
  if (!loadDraftEntry(key)) {
    const media = imetaMediaFromTags(row.message.tags);
    persistDraftEntry(
      key,
      stripImetaMediaLines(row.message.content, media),
      row.message.channelId,
      media,
      [...findSpoileredImetaMediaUrls(row.message.content, media)],
      row.mentionRefs ?? [],
    );
  }
  saveQueuedAttachmentsForDraft(
    key,
    row.attachments.map((attachment, index) => ({
      id: index,
      file: new File([attachment.bytes], attachment.name, {
        type: attachment.bytes.type,
      }),
      spoilered: attachment.spoilered,
    })),
  );
}

export function OutboxEditor({
  row,
  onClose,
}: {
  row: OutboxRecord;
  onClose: () => void;
}) {
  const composer = (
    <div className="rounded-lg border bg-background">
      <MessageComposer
        channelId={row.message.channelId}
        channelName="queued message"
        channelType={row.message.channel?.channelType}
        draftKey={outboxEditKey(row.id)}
        showOutboxRows={false}
        placeholder="Edit queued message"
        onCaptureSendContext={() =>
          row.message.parentEventId
            ? {
                parentEventId: row.message.parentEventId,
                threadHeadId: row.message.rootEventId,
              }
            : null
        }
        onSend={async (
          content,
          recipients,
          tags,
          _channelId,
          _context,
          _rest,
          submission,
        ) => {
          if (!submission) throw new Error("Queued edit was not captured.");
          await editOutbox(
            row.id,
            content,
            tags ?? [],
            row.message.channel
              ? messageMentionPubkeys(
                  row.message.channel,
                  row.message.signerPubkey,
                  recipients,
                )
              : recipients,
            submission,
          );
          onClose();
        }}
        toolbarExtraActions={
          <button
            className="text-xs text-muted-foreground"
            type="button"
            onClick={() => {
              void cancelOutboxEdit(row.id)
                .then(onClose)
                .catch((error: unknown) => toast.error(String(error)));
            }}
          >
            Cancel edit
          </button>
        }
      />
    </div>
  );
  // MessageComposer supplies its own boundary for this isolated draft key.
  // Do not inherit the surrounding conversation composer's presentation token.
  return (
    <DraftEditorPresentationContext.Provider value={null}>
      {composer}
    </DraftEditorPresentationContext.Provider>
  );
}

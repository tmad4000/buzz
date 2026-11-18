import * as React from "react";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { ConversationDraftEditorsContext } from "@/features/conversations/ConversationDraftEditors";
import { ConversationComposerOwnership } from "@/features/conversations/ConversationComposerOwnership";
import type { MessageComposerProps } from "./MessageComposer.types";

/** Preserve a single ownership boundary around the live composer implementation. */
export function withConversationComposerOwnership(
  Composer: React.ComponentType<MessageComposerProps>,
) {
  function MessageComposerWithOwnership(props: MessageComposerProps) {
    const coordinator = React.useContext(ConversationDraftEditorsContext);
    const view = React.useContext(ConversationViewContext);
    const draftKey = props.draftKey ?? props.channelId;
    const composer = (
      <Composer
        {...props}
        autoSubmitDraftKey={view ? null : props.autoSubmitDraftKey}
      />
    );
    return coordinator && view && draftKey ? (
      <ConversationComposerOwnership
        coordinator={coordinator}
        viewInstanceId={view.viewInstanceId}
        draftKey={draftKey}
        onAttachmentAcceptanceChange={props.onAttachmentAcceptanceChange}
        containerClassName={props.containerClassName}
      >
        {composer}
      </ConversationComposerOwnership>
    ) : (
      composer
    );
  }
  return React.memo(MessageComposerWithOwnership);
}

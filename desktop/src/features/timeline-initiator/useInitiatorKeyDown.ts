import { type KeyboardEvent, useContext } from "react";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
import { nextInitiatorFilter } from "./model";
import { isTimelineInitiatorShortcut } from "./shortcut";
import type { TimelineInitiatorView } from "./useTimelineInitiator";

/** Handle the shortcut on the existing channel region's focused event path. */
export function useInitiatorKeyDown(
  initiator: TimelineInitiatorView | undefined,
) {
  const view = useContext(ConversationViewContext);
  if (!initiator || (view && (!view.focused || !view.visible)))
    return undefined;

  return (event: KeyboardEvent<HTMLElement>) => {
    const { target, currentTarget: owner } = event;
    if (
      !(target instanceof HTMLElement) ||
      !owner.contains(target) ||
      target.closest(
        "input, textarea, select, [contenteditable], [role=textbox], [role=combobox]",
      ) ||
      !isTimelineInitiatorShortcut(event.nativeEvent)
    )
      return;

    event.preventDefault();
    initiator.setFilter(nextInitiatorFilter(initiator.filter));
    requestAnimationFrame(() => {
      if (
        owner.isConnected &&
        !target.isConnected &&
        document.activeElement === document.body
      ) {
        owner
          .querySelector<HTMLElement>('[aria-label="Timeline initiator"]')
          ?.focus();
      }
    });
  };
}

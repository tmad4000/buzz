import { hasPrimaryShortcutModifier } from "@/shared/lib/platform";

type TimelineKey = Pick<
  KeyboardEvent,
  | "altKey"
  | "ctrlKey"
  | "defaultPrevented"
  | "isComposing"
  | "key"
  | "metaKey"
  | "repeat"
  | "shiftKey"
>;

export function isTimelineInitiatorShortcut(event: TimelineKey): boolean {
  return (
    !event.defaultPrevented &&
    !event.repeat &&
    !event.isComposing &&
    !event.altKey &&
    event.shiftKey &&
    event.key.toLowerCase() === "y" &&
    hasPrimaryShortcutModifier(event)
  );
}

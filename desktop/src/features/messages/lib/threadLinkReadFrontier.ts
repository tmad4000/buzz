import type { RelayEvent } from "@/shared/api/types";
import { isThreadLinkCandidate } from "./threadLinks";
import { getThreadReference } from "./threading";

/** Pending controls cannot mark originals read; rejected controls are ordinary. */
export function latestOrdinaryTopLevel(
  events: readonly RelayEvent[] | undefined,
  rejectedAnnotationIds: ReadonlySet<string>,
): RelayEvent | null {
  if (!events) return null;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (isThreadLinkCandidate(event) && !rejectedAnnotationIds.has(event.id))
      continue;
    if (getThreadReference(event.tags).parentId === null) return event;
  }
  return null;
}

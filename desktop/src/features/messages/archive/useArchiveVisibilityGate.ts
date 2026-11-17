import * as React from "react";
import type { TimelineMessage } from "../types";
import { useArchive } from "./ArchiveProvider";
import { excludeArchivedReplies } from "./unseen";
/** Adapter for the existing observer, never a second observer or seen writer. */
export function useArchiveVisibilityGate(
  messages: TimelineMessage[],
  scope: string,
  rootId?: string,
) {
  const archive = useArchive();
  const eligible = React.useMemo(
    () =>
      archive.ready
        ? excludeArchivedReplies(messages, archive.records, rootId)
        : [],
    [messages, archive.ready, archive.records, rootId],
  );
  return {
    messages: eligible,
    scope: JSON.stringify([scope, archive.revision, archive.ready]),
    filterVisible: archive.filterUnarchived,
  };
}

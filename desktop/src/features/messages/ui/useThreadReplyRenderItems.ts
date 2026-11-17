import * as React from "react";
import type { TimelineMessage } from "../types";
import {
  getActiveContinuationDepths,
  type MainTimelineEntry,
} from "../lib/threadPanel";
import {
  hasSameMessageAuthor,
  isWithinGroupingWindow,
} from "../lib/messageGrouping";
import type { ThreadDepthGuideAction } from "./MessageRow";

export function useThreadReplyRenderItems({
  deferredThreadReplies,
  firstUnreadReplyId,
  hoveredCollapseBranchId,
  isHuddleTranscript,
  isSidebar,
  threadHead,
  threadHeadId,
}: {
  deferredThreadReplies: MainTimelineEntry[];
  firstUnreadReplyId?: string | null;
  hoveredCollapseBranchId: string | null;
  isHuddleTranscript: boolean;
  isSidebar: boolean;
  threadHead: TimelineMessage | null;
  threadHeadId: string | null;
}) {
  const highlightedBranch = React.useMemo(() => {
    if (!hoveredCollapseBranchId) {
      return null;
    }

    if (hoveredCollapseBranchId === threadHeadId) {
      return {
        depth: 0,
        endIndex: deferredThreadReplies.length - 1,
        id: hoveredCollapseBranchId,
        startIndex: -1,
      };
    }

    const startIndex = deferredThreadReplies.findIndex(
      (entry) => entry.message.id === hoveredCollapseBranchId,
    );
    if (startIndex < 0) {
      return null;
    }

    const depth = deferredThreadReplies[startIndex].message.depth;
    let endIndex = startIndex;
    while (
      endIndex + 1 < deferredThreadReplies.length &&
      deferredThreadReplies[endIndex + 1].message.depth > depth
    ) {
      endIndex += 1;
    }

    return {
      depth,
      endIndex,
      id: hoveredCollapseBranchId,
      startIndex,
    };
  }, [deferredThreadReplies, hoveredCollapseBranchId, threadHeadId]);
  const threadReplyRenderItems = React.useMemo(() => {
    if (!threadHead) {
      return [];
    }

    const ancestorStack: { index: number; message: TimelineMessage }[] = [
      { index: -1, message: threadHead },
    ];
    let previousGroupMessage: TimelineMessage | null = threadHead;

    return deferredThreadReplies.map((entry, index) => {
      while (
        ancestorStack.length > 0 &&
        ancestorStack[ancestorStack.length - 1].message.depth >=
          entry.message.depth
      ) {
        ancestorStack.pop();
      }

      const ancestors = [...ancestorStack];
      const continuationDepths = getActiveContinuationDepths({
        ancestors,
        entries: deferredThreadReplies,
        index,
        message: entry.message,
      });
      const collapseDepthGuideAncestors = ancestors.filter((ancestor) =>
        continuationDepths.includes(ancestor.message.depth),
      );
      const collapseDepthGuideActions: ThreadDepthGuideAction[] | undefined =
        collapseDepthGuideAncestors.length > 0
          ? collapseDepthGuideAncestors.map((ancestor) => ({
              active:
                hoveredCollapseBranchId === ancestor.message.id &&
                entry.message.depth === ancestor.message.depth + 1,
              depth: ancestor.message.depth,
              label:
                ancestor.message.id === threadHead.id
                  ? "Collapse thread"
                  : "Collapse replies",
              message: ancestor.message,
            }))
          : undefined;
      const nextEntry = deferredThreadReplies[index + 1];
      const connectsToVisibleChild =
        nextEntry != null && nextEntry.message.depth > entry.message.depth;
      const startsUnreadSection =
        index > 0 && entry.message.id === firstUnreadReplyId;
      const isContinuation =
        !isHuddleTranscript &&
        !startsUnreadSection &&
        (!isSidebar ||
          (previousGroupMessage?.depth === entry.message.depth &&
            previousGroupMessage?.parentId === entry.message.parentId)) &&
        entry.summary === null &&
        hasSameMessageAuthor(previousGroupMessage, entry.message) &&
        isWithinGroupingWindow(
          previousGroupMessage?.createdAt,
          entry.message.createdAt,
        );

      if (connectsToVisibleChild && !entry.summary) {
        ancestorStack.push({ index, message: entry.message });
      }

      previousGroupMessage = entry.summary !== null ? null : entry.message;

      return {
        collapseDepthGuideActions,
        connectsToVisibleChild,
        continuationDepths,
        entry,
        index,
        isContinuation,
      };
    });
  }, [
    deferredThreadReplies,
    firstUnreadReplyId,
    hoveredCollapseBranchId,
    isHuddleTranscript,
    isSidebar,
    threadHead,
  ]);
  return { highlightedBranch, threadReplyRenderItems };
}

import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import type { MainTimelineEntry, ThreadPanelIndex } from "./threadPanel";
import type { TimelineMessage } from "../types";

export type ThreadRoutingScope = { headId: string; rootEventId: string };

/** Only proved descendant paths enter a thread-scoped picker; missing ancestry fails closed. */
export function descendantRoutingIds(
  entries: readonly MainTimelineEntry[],
  headId: string,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const { message } of entries) {
    if (!message.parentId) continue;
    const ids = children.get(message.parentId) ?? [];
    ids.push(message.id);
    children.set(message.parentId, ids);
  }
  const seen = new Set([headId]);
  const queue = [headId];
  for (let i = 0; i < queue.length; i++) {
    for (const id of children.get(queue[i]) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  seen.delete(headId);
  return seen;
}

/** Reuse the loaded thread index without changing disclosure/read state. */
export function buildThreadRoutingEntries(
  messages: readonly TimelineMessage[],
  index: ThreadPanelIndex,
): MainTimelineEntry[] {
  return messages.map((message) => {
    const stats = index.descendantStatsByMessageId.get(message.id);
    return {
      message,
      summary:
        stats && stats.descendantCount > 0
          ? {
              threadHeadId: message.id,
              replyCount: stats.descendantCount,
              lastReplyAt: stats.lastReplyAt,
              participants: stats.recentParticipantsNewestFirst,
            }
          : null,
    };
  });
}

function routable(message: TimelineMessage): boolean {
  return (
    !message.pending &&
    !message.id.startsWith("outbox-local:") &&
    (message.kind == null ||
      message.kind === KIND_STREAM_MESSAGE ||
      message.kind === KIND_STREAM_MESSAGE_V2)
  );
}

/** Explicit nested choice retains the canonical NIP-10 root, independently of the current reply banner. */
export function resolveNestedRoutingTarget(
  scope: ThreadRoutingScope,
  entries: readonly MainTimelineEntry[],
  chosenId: string | null,
): { parentEventId: string; threadHeadId: string } | null {
  if (
    !scope.headId ||
    !scope.rootEventId ||
    scope.rootEventId.startsWith("outbox-local:") ||
    !entries.some(
      ({ message }) => message.id === scope.headId && routable(message),
    )
  )
    return null;
  if (chosenId === null)
    return { parentEventId: scope.headId, threadHeadId: scope.rootEventId };
  if (
    !descendantRoutingIds(entries, scope.headId).has(chosenId) ||
    !entries.some(({ message }) => message.id === chosenId && routable(message))
  )
    return null;
  return { parentEventId: chosenId, threadHeadId: scope.rootEventId };
}

const STOP_WORDS = new Set(
  "a an and are as at be by for from has have i in is it of on or that the this to was we will with you your".split(
    " ",
  ),
);
function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? []).filter(
      (word) => word.length > 1 && !STOP_WORDS.has(word),
    ),
  );
}
export type RankedThread = {
  id: string;
  title: string;
  author: string;
  replyCount: number;
  score: number;
  reason: string;
};
/** Ranks only the current pane's loaded roots; no remote or model request. */
export function rankThreadDestinations(
  entries: readonly MainTimelineEntry[],
  draft: string,
  now = Date.now() / 1000,
  threadHeadId?: string,
): RankedThread[] {
  const terms = words(draft.slice(0, 16000));
  const descendants = threadHeadId
    ? descendantRoutingIds(entries, threadHeadId)
    : null;
  return entries
    .filter(
      ({ message }) =>
        routable(message) &&
        (descendants ? descendants.has(message.id) : !message.parentId),
    )
    .map(({ message, summary }) => {
      const title = message.body.replace(/\s+/g, " ").trim().slice(0, 180);
      const titleTerms = words(message.body.slice(0, 4000));
      const matches = [...terms].filter((word) => titleTerms.has(word));
      const participants = [
        message.author,
        ...(summary?.participants.map((p) => p.author) ?? []),
      ];
      const participantMatch = participants.some((name) =>
        [...words(name)].some((word) => terms.has(word)),
      );
      const latest = summary?.lastReplyAt ?? message.createdAt;
      const recency = 1 / (1 + Math.max(0, now - latest) / 86400);
      return {
        id: message.id,
        title: title || "Attachment",
        author: message.author,
        replyCount: summary?.replyCount ?? 0,
        score: matches.length * 4 + (participantMatch ? 2 : 0) + recency,
        reason: matches.length
          ? `Matches: ${matches.slice(0, 3).join(", ")}`
          : participantMatch
            ? "Participant mentioned in draft"
            : "Recent conversation",
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 3);
}

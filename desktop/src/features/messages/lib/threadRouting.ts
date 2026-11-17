import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import type { MainTimelineEntry } from "./threadPanel";

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
): RankedThread[] {
  const terms = words(draft.slice(0, 16000));
  return entries
    .filter(
      ({ message }) =>
        !message.parentId &&
        !message.pending &&
        (message.kind == null ||
          message.kind === KIND_STREAM_MESSAGE ||
          message.kind === KIND_STREAM_MESSAGE_V2),
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

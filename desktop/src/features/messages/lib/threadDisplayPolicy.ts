import {
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_V2,
} from "@/shared/constants/kinds";
import type { TimelineMessage } from "@/features/messages/types";
import { setLocalStorageItemWithRecovery } from "@/shared/lib/localStorageQuota";
export type ThreadDisplayMode = "collapsed" | "smart" | "expanded";
export type ThreadDisplayPolicy = {
  channels: ThreadDisplayMode;
  replies: ThreadDisplayMode;
};
const failedPolicies = new Map<string, ThreadDisplayPolicy>();
export const THREAD_DISPLAY_MODES = ["collapsed", "smart", "expanded"] as const;
export function threadDisplayKey(community: string | null, identity?: string) {
  return `buzz-thread-display.v1:${JSON.stringify([community, identity ?? null])}`;
}
export function loadThreadDisplayPolicy(key: string): ThreadDisplayPolicy {
  const failed = failedPolicies.get(key);
  if (failed) return failed;
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "null");
    const valid = (mode: unknown): mode is ThreadDisplayMode =>
      THREAD_DISPLAY_MODES.includes(mode as ThreadDisplayMode);
    return {
      channels: valid(value?.channels) ? value.channels : "smart",
      replies: valid(value?.replies) ? value.replies : "smart",
    };
  } catch {
    return { channels: "smart", replies: "smart" };
  }
}
export function saveThreadDisplayPolicy(
  key: string,
  policy: ThreadDisplayPolicy,
) {
  const persisted = setLocalStorageItemWithRecovery(
    key,
    JSON.stringify(policy),
  );
  if (persisted) failedPolicies.delete(key);
  else failedPolicies.set(key, { ...policy });
  return persisted;
}
const authoredLines = (text: string) =>
  text.split(/\r\n|[\n\r\u2028\u2029]/u).length;

/** Bound authored lines and Unicode characters, never visual wrapping. */
export function isShortThreadReply(message: TimelineMessage) {
  return (
    (message.kind === undefined ||
      message.kind === KIND_STREAM_MESSAGE ||
      message.kind === KIND_STREAM_MESSAGE_V2) &&
    !message.pending &&
    message.body.trim().length > 0 &&
    Array.from(message.body).length <= 600 &&
    authoredLines(message.body) <= 8 &&
    !/```|~~~|!\[|<(?:[a-z!/])/i.test(message.body) &&
    !message.tags?.some((tag) =>
      ["imeta", "media", "attachment"].includes(tag[0]),
    )
  );
}
export type SmartThreadDecision = {
  kind: "answer" | "compact";
  answerId?: string;
} | null;
/** P0/P2 only. Unknown bodies never imply a compact conversation. */
export function smartThreadDecision(
  root: TimelineMessage,
  replies: TimelineMessage[],
  total: number | null,
  identity?: string,
  now = Date.now() / 1000,
): SmartThreadDecision {
  if (total === null || !Number.isInteger(total) || total < 1 || total > 4)
    return null;
  const ordered = [
    ...new Map(
      replies.filter((m) => m.id !== root.id).map((m) => [m.id, m]),
    ).values(),
  ].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (ordered.length > total) return null;
  const byId = new Map([root, ...ordered].map((m) => [m.id, m]));
  const question = /[?？؟]/u.test(root.body);
  const answer = ordered.find(
    (reply) =>
      isShortThreadReply(reply) &&
      ((question && reply.parentId === root.id) ||
        (reply.isAgent === true &&
          identity !== undefined &&
          byId.get(reply.parentId ?? "")?.pubkey === identity)),
  );
  if (answer) return { kind: "answer", answerId: answer.id };
  if (ordered.length !== total || !ordered.every(isShortThreadReply))
    return null;
  const characters = ordered.reduce((n, m) => n + Array.from(m.body).length, 0);
  const lines = ordered.reduce((n, m) => n + authoredLines(m.body), 0);
  const latest = Math.max(...ordered.map((m) => m.createdAt));
  return characters <= 1200 && lines <= 16 && Math.max(0, now - latest) <= 86400
    ? { kind: "compact" }
    : null;
}
/** Treat all existing v1 values as remembered choices, without guessing provenance. */
export function initialBranchChoice(
  saved: ReadonlyMap<string, boolean>,
  id: string,
  mode: ThreadDisplayMode,
  descendants: number,
  unreadPath: boolean,
) {
  if (saved.has(id)) return saved.get(id) === true;
  return (
    mode === "expanded" ||
    (mode === "smart" && (descendants <= 4 || unreadPath))
  );
}

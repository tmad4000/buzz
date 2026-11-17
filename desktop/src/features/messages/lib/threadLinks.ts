import { verifyEvent } from "nostr-tools/pure";

import type { RelayEvent } from "@/shared/api/types";
import { resolveEventAuthorPubkey } from "@/shared/lib/authors";

/** A versioned message subtype, not a newly admitted relay event kind. */
export const THREAD_LINK_MARKER = "buzz-thread-link-v1";
const HEX = /^[0-9a-f]{64}$/;
const SIGNATURE = /^[0-9a-f]{128}$/;
const CHANNEL = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const ANNOTATION_TAGS = new Set([
  "h",
  "t",
  "buzz-thread-op",
  "buzz-thread-child",
  "buzz-thread-parent",
  "buzz-thread-previous",
]);

/** The caller captures this authenticated read scope before its first await. */
export type ThreadLinkScope = {
  communityUrl: string;
  channelId: string;
  relaySelfPubkey?: string | null;
};

/** Verified annotation metadata; original message bodies are never copied here. */
export type ThreadLinkAnnotation = {
  id: string;
  authorPubkey: string;
  createdAt: number;
  operation: "link" | "unlink";
  childId: string;
  parentId: string | null;
  previousId: string | null;
};

/** A malformed reserved subtype remains visible content, not a trusted command. */
export type ThreadLinkParseResult =
  | { state: "not-annotation" }
  | { state: "invalid"; eventId: string | null; reason: string }
  | { state: "valid"; annotation: ThreadLinkAnnotation };

/** Validate a transport scope; a channel tag alone cannot authenticate a host. */
export function validThreadLinkScope(scope: ThreadLinkScope): boolean {
  try {
    if (scope.communityUrl.length > 2048) return false;
    const url = new URL(scope.communityUrl);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      CHANNEL.test(scope.channelId)
    );
  } catch {
    return false;
  }
}

/** Recognize only the reserved subtype; this is not an authorization check. */
export function isThreadLinkCandidate(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const tags = (value as { tags?: unknown }).tags;
  return (
    Array.isArray(tags) &&
    tags.length <= 128 &&
    tags.some(
      (tag) =>
        Array.isArray(tag) && tag[0] === "t" && tag[1] === THREAD_LINK_MARKER,
    )
  );
}

/** Verify hash and BIP340 signature on a fresh copy, ignoring cached symbols. */
export function verifiedThreadMessage(
  value: unknown,
  channelId: string,
): RelayEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as RelayEvent;
  if (
    typeof event.id !== "string" ||
    !HEX.test(event.id) ||
    typeof event.pubkey !== "string" ||
    !HEX.test(event.pubkey) ||
    typeof event.sig !== "string" ||
    !SIGNATURE.test(event.sig) ||
    !Number.isSafeInteger(event.created_at) ||
    event.created_at < 0 ||
    ![9, 40002].includes(event.kind) ||
    typeof event.content !== "string" ||
    event.content.length > 262144 ||
    !Array.isArray(event.tags) ||
    event.tags.length > 128
  ) {
    return null;
  }
  let tagCharacters = 0;
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || !tag.length || tag.length > 16) return null;
    for (const part of tag) {
      if (typeof part !== "string") return null;
      tagCharacters += part.length;
      if (tagCharacters > 16384) return null;
    }
  }
  const channelTags = event.tags.filter((tag) => tag[0] === "h");
  if (
    channelTags.length !== 1 ||
    channelTags[0].length !== 2 ||
    channelTags[0][1] !== channelId
  ) {
    return null;
  }
  const copy: RelayEvent = {
    id: event.id,
    pubkey: event.pubkey,
    sig: event.sig,
    kind: event.kind,
    created_at: event.created_at,
    tags: event.tags.map((tag) => [...tag]),
    content: event.content,
  };
  try {
    return verifyEvent(copy) ? copy : null;
  } catch {
    return null;
  }
}

/** Resolve the signed message author using only the active relay's attribution. */
export function threadMessageAuthor(
  event: RelayEvent,
  scope: ThreadLinkScope,
): string {
  return resolveEventAuthorPubkey({
    event,
    relaySelfPubkey: scope.relaySelfPubkey,
    requireChannelTagForPTags: true,
  });
}

/** Parse the exact author-only v1 wire convention; no delegated grants in v1. */
export function parseThreadLink(
  value: unknown,
  scope: ThreadLinkScope,
): ThreadLinkParseResult {
  if (!isThreadLinkCandidate(value)) return { state: "not-annotation" };
  const candidateId = (value as { id?: unknown }).id;
  const eventId =
    typeof candidateId === "string" && HEX.test(candidateId)
      ? candidateId
      : null;
  const invalid = (reason: string): ThreadLinkParseResult => ({
    state: "invalid",
    eventId,
    reason,
  });
  if (!validThreadLinkScope(scope)) return invalid("invalid-scope");
  const event = verifiedThreadMessage(value, scope.channelId);
  if (event?.kind !== 9) return invalid("invalid-signed-envelope");
  const tags = new Map<string, string>();
  for (const tag of event.tags) {
    if (tag.length !== 2 || !ANNOTATION_TAGS.has(tag[0]) || tags.has(tag[0])) {
      return invalid("unexpected-or-duplicate-tag");
    }
    tags.set(tag[0], tag[1]);
  }
  const operation = tags.get("buzz-thread-op");
  const childId = tags.get("buzz-thread-child");
  const parentId = tags.get("buzz-thread-parent");
  const previous = tags.get("buzz-thread-previous");
  if (
    tags.get("t") !== THREAD_LINK_MARKER ||
    !childId ||
    !HEX.test(childId) ||
    !previous ||
    (previous !== "none" && !HEX.test(previous)) ||
    (operation !== "link" && operation !== "unlink") ||
    (operation === "link" && (!parentId || !HEX.test(parentId))) ||
    (operation === "unlink" && parentId !== undefined)
  ) {
    return invalid("invalid-operation");
  }
  if (childId === parentId) return invalid("self-link");
  return {
    state: "valid",
    annotation: {
      id: event.id,
      authorPubkey: event.pubkey,
      createdAt: event.created_at,
      operation,
      childId,
      parentId: parentId ?? null,
      previousId: previous === "none" ? null : previous,
    },
  };
}

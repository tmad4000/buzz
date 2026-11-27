import type { DraftMentionRef } from "./useDrafts";

/**
 * Explicitly address an agent in a composer draft from outside the composer
 * (for example "Ask <name>'s agent" on a profile).
 *
 * A mounted composer owns its draft: it restores storage only when its key
 * changes and overwrites storage when it unmounts. So a seed is always applied
 * by the live composer for its draft key. A seed requested just before
 * navigation waits (briefly) for that composer to mount; it never writes
 * storage behind a composer's back.
 */

export type DraftAddressSeed = { pubkey: string; displayName: string };

type Handler = (seed: DraftAddressSeed) => void;

/** A pending seed older than this is dropped instead of surprising a later visit. */
export const DRAFT_ADDRESS_SEED_TTL_MS = 30_000;

const handlersByKey = new Map<string, Handler[]>();
const pendingByKey = new Map<string, { seed: DraftAddressSeed; at: number }>();

export function subscribeDraftAddressSeed(
  draftKey: string,
  handler: Handler,
  nowMs = Date.now(),
): () => void {
  const handlers = handlersByKey.get(draftKey) ?? [];
  handlersByKey.set(draftKey, [...handlers, handler]);
  const pending = pendingByKey.get(draftKey);
  if (pending) {
    pendingByKey.delete(draftKey);
    if (nowMs - pending.at <= DRAFT_ADDRESS_SEED_TTL_MS) handler(pending.seed);
  }
  return () => {
    const remaining = (handlersByKey.get(draftKey) ?? []).filter(
      (candidate) => candidate !== handler,
    );
    if (remaining.length > 0) handlersByKey.set(draftKey, remaining);
    else handlersByKey.delete(draftKey);
  };
}

/**
 * Apply now in the most recently mounted composer for the key, or hold it for
 * the composer that is about to mount. Returns whether it was applied now.
 */
export function requestDraftAddressSeed(
  draftKey: string,
  seed: DraftAddressSeed,
  nowMs = Date.now(),
): boolean {
  const handler = handlersByKey.get(draftKey)?.at(-1);
  if (handler) {
    pendingByKey.delete(draftKey);
    handler(seed);
    return true;
  }
  pendingByKey.set(draftKey, { seed, at: nowMs });
  return false;
}

function normalize(pubkey: string) {
  return pubkey.trim().toLowerCase();
}

/**
 * Lead the draft with a pubkey-pinned `@name ` mention. Idempotent: a draft
 * that already addresses this agent is returned unchanged, so repeating the
 * action never stacks mentions.
 */
export function addressDraft(
  content: string,
  mentionRefs: readonly DraftMentionRef[],
  seed: DraftAddressSeed,
): {
  changed: boolean;
  content: string;
  leadingText: string;
  mentionRefs: DraftMentionRef[];
} {
  const pubkey = normalize(seed.pubkey);
  const mention = `@${seed.displayName}`;
  const leadingText = `${mention} `;
  const pinned = mentionRefs.some((ref) => normalize(ref.pubkey) === pubkey);
  if (pinned && content.includes(mention)) {
    return {
      changed: false,
      content,
      leadingText: "",
      mentionRefs: [...mentionRefs],
    };
  }
  return {
    changed: true,
    content: `${leadingText}${content}`,
    leadingText,
    mentionRefs: [
      ...mentionRefs.filter((ref) => normalize(ref.pubkey) !== pubkey),
      { displayName: seed.displayName, pubkey, isAgent: true },
    ],
  };
}

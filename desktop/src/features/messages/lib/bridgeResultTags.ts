import { verifyEvent } from "nostr-tools/pure";
import type { RelayEvent } from "@/shared/api/types";
import { BRIDGE_STATUS_SIGNER } from "./bridgeStatusCard";

export const BUZZ_RESULT_TAG = "buzz-result";

function hasBridgeSignature(event: RelayEvent): boolean {
  if (
    event.pubkey !== BRIDGE_STATUS_SIGNER ||
    event.pending ||
    event.localEditedContent
  ) {
    return false;
  }
  try {
    // Verify the canonical fields, independent of any cached verification on a
    // locally copied event object.
    const { id, pubkey, kind, created_at, tags, content, sig } = event;
    return verifyEvent({ id, pubkey, kind, created_at, tags, content, sig });
  } catch {
    return false;
  }
}

/** Carry only the verified effective snapshot's result tag into the timeline. */
export function overlayBridgeResultTags(
  tags: string[][],
  original: RelayEvent,
  edit?: RelayEvent,
): string[][] {
  const snapshot = edit ?? original;
  const results = snapshot.tags.filter(([name]) => name === BUZZ_RESULT_TAG);
  const originalHasResult = tags.some(([name]) => name === BUZZ_RESULT_TAG);
  if (!results.length && !originalHasResult) return tags;

  const remaining = tags.filter(([name]) => name !== BUZZ_RESULT_TAG);
  if (
    !results.length ||
    !hasBridgeSignature(original) ||
    (edit && !hasBridgeSignature(edit))
  ) {
    return remaining;
  }
  return [...remaining, ...results];
}

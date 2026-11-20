import { trimMapToSize } from "@/shared/lib/trimMapToSize";

export type MessageBodyPreference = "collapsed" | "expanded";

export const MESSAGE_BODY_LINE_LIMIT = 12;
const MESSAGE_BODY_CHARACTER_LIMIT = 800;
const EVENT_ID = /^[0-9a-f]{64}$/i;
const KEY_PREFIX = "buzz:message-body:v1:";
const TRANSIENT_LIMIT = 2048;
export const MESSAGE_BODY_PREFERENCE_CHANGED =
  "buzz:message-body-preference-changed";
const transientPreferences = new Map<string, MessageBodyPreference>();

/** Retire anonymous or storage-denied choices with the community session. */
export function resetMessageBodyMemoryPreferences(): void {
  if (!transientPreferences.size) return;
  transientPreferences.clear();
  window.dispatchEvent(new Event(MESSAGE_BODY_PREFERENCE_CHANGED));
}

/** The scope uses only local community and canonical account/channel/event IDs. */
export function messageBodyPreferenceKey(
  communityId: string | undefined,
  viewer: string | undefined,
  channelId: string | null,
  messageId: string,
): string | null {
  if (
    !communityId ||
    !viewer ||
    !EVENT_ID.test(viewer) ||
    !channelId ||
    !EVENT_ID.test(messageId)
  ) {
    return null;
  }

  return (
    KEY_PREFIX +
    JSON.stringify([
      communityId,
      viewer.toLowerCase(),
      channelId,
      messageId.toLowerCase(),
    ])
  );
}

export function isLongMessageBody(body: string): boolean {
  let lines = 1;
  let characters = 0;
  for (const character of body) {
    characters++;
    if (character === "\n") lines++;
    if (
      characters > MESSAGE_BODY_CHARACTER_LIMIT ||
      lines > MESSAGE_BODY_LINE_LIMIT
    ) {
      return true;
    }
  }
  return false;
}

export function readMessageBodyPreference(
  key: string | null,
  scope: string,
): MessageBodyPreference | null {
  const transient = transientPreferences.get(scope);
  if (transient) return transient;
  if (!key) return null;

  try {
    const value = window.localStorage.getItem(key);
    return value === "collapsed" || value === "expanded" ? value : null;
  } catch {
    return null;
  }
}

export function saveMessageBodyPreference(
  key: string | null,
  scope: string,
  preference: MessageBodyPreference,
): void {
  if (key) {
    try {
      window.localStorage.setItem(key, preference);
      transientPreferences.delete(scope);
      window.dispatchEvent(
        new CustomEvent(MESSAGE_BODY_PREFERENCE_CHANGED, { detail: scope }),
      );
      return;
    } catch {
      // Storage-denied views still synchronize for this scoped session.
    }
  }
  transientPreferences.delete(scope);
  transientPreferences.set(scope, preference);
  const evicted = transientPreferences.size > TRANSIENT_LIMIT;
  trimMapToSize(transientPreferences, TRANSIENT_LIMIT);
  window.dispatchEvent(
    new CustomEvent(MESSAGE_BODY_PREFERENCE_CHANGED, {
      detail: evicted ? null : scope,
    }),
  );
}

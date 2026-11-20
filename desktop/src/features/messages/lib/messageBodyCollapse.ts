export type MessageBodyPreference = "collapsed" | "expanded";

export const MESSAGE_BODY_LINE_LIMIT = 12;
const MESSAGE_BODY_CHARACTER_LIMIT = 800;
const EVENT_ID = /^[0-9a-f]{64}$/i;
const KEY_PREFIX = "buzz:message-body:v1:";

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
): MessageBodyPreference | null {
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
  preference: MessageBodyPreference,
): boolean {
  if (!key) return false;

  try {
    window.localStorage.setItem(key, preference);
    return true;
  } catch {
    return false;
  }
}

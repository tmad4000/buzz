import { ConversationAutoSendPermits } from "./autoSendPermits.ts";

const permits = new WeakMap<object, ConversationAutoSendPermits>();
const key = "buzzConversationAutoSend";

/** One transient command bridge per router history, never a canonical chat singleton. */
export function autoSendPermitsFor(history: object) {
  let value = permits.get(history);
  if (!value) {
    value = new ConversationAutoSendPermits();
    permits.set(history, value);
  }
  return value;
}

export function withAutoSendPermitState(
  previous: Record<string, unknown>,
  token: string | null,
) {
  const state = { ...previous };
  delete state[key];
  if (token) state[key] = { version: 1, token };
  return state;
}

export function autoSendPermitToken(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const metadata = (state as Record<string, unknown>)[key];
  if (!metadata || typeof metadata !== "object") return null;
  const { version, token } = metadata as Record<string, unknown>;
  return version === 1 &&
    typeof token === "string" &&
    token.length > 0 &&
    token.length <= 256
    ? token
    : null;
}

/** Read the actual history href, not the planned destination or copied view metadata. */
export function autoSendEntryFromHref(href: string) {
  try {
    const url = new URL(href, "https://buzz.invalid");
    const match = /^\/channels\/([^/]+)\/?$/.exec(url.pathname);
    const drafts = url.searchParams.getAll("autoSend");
    if (!match || drafts.length !== 1 || !drafts[0] || drafts[0].length > 1024)
      return null;
    const channelId = decodeURIComponent(match[1]);
    return channelId && channelId.length <= 256
      ? { channelId, draftKey: drafts[0] }
      : null;
  } catch {
    return null;
  }
}

export function bindAutoSendHistoryEntry(
  permits: ConversationAutoSendPermits,
  location: { href: string; state: unknown },
  action: string,
): boolean {
  const token = autoSendPermitToken(location.state);
  if (!token) return false;
  const entry = autoSendEntryFromHref(location.href);
  const key = (location.state as { __TSR_key?: unknown }).__TSR_key;
  if (!entry || typeof key !== "string") {
    permits.cancel(token);
    return false;
  }
  return permits.bindEntry(token, { ...entry, key, action });
}

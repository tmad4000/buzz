export const PASEO_HOST_PUBKEY =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
export const PASEO_STALE_MS = 3 * 60_000;
export type HostWatch = {
  startedAt: number;
  lastSeenAt: number | null;
  offlineSince: number | null;
};
export type PresenceSample = { status?: string; observedAt: number };
export function isPaseoCommunity(relayUrl?: string): boolean {
  try {
    const u = new URL(relayUrl ?? "");
    return (
      (u.protocol === "wss:" || u.protocol === "https:") &&
      u.hostname === "jprojects.communities.buzz.xyz" &&
      !u.port &&
      (u.pathname === "/" || !u.pathname)
    );
  } catch {
    return false;
  }
}
export function advanceHostWatch(
  previous: HostWatch,
  sample: PresenceSample,
  now: number,
): HostWatch {
  const positive = sample.status === "online" || sample.status === "away";
  const lastSeenAt =
    positive && sample.observedAt > (previous.lastSeenAt ?? 0)
      ? Math.min(sample.observedAt, now)
      : previous.lastSeenAt;
  const reference = lastSeenAt ?? previous.startedAt;
  const offlineSince =
    now - reference > PASEO_STALE_MS
      ? (previous.offlineSince ?? reference)
      : null;
  if (
    lastSeenAt === previous.lastSeenAt &&
    offlineSince === previous.offlineSince
  )
    return previous;
  return { ...previous, lastSeenAt, offlineSince };
}
export function hostTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
}
export function hostOfflineText(since: number): string {
  return `Paseo host offline since ${hostTime(since)}: ⏳ statuses may be stale`;
}
export function isPaseoWorkingCard(message: {
  pubkey?: string;
  signerPubkey?: string;
  body: string;
}): boolean {
  return (
    (message.signerPubkey ?? message.pubkey)?.toLowerCase() ===
      PASEO_HOST_PUBKEY &&
    /^⏳\uFE0F?\s+Working\b/u.test(message.body.trimStart()) &&
    (message.body.includes("\nItem: ") ||
      message.body.includes("\nReported status · source: "))
  );
}
export function isPaseoWorkingReaction(reaction: {
  emoji: string;
  users: readonly { pubkey: string }[];
}): boolean {
  return (
    reaction.emoji.replace(/\uFE0F/gu, "") === "⏳" &&
    reaction.users.some(
      (user) => user.pubkey.toLowerCase() === PASEO_HOST_PUBKEY,
    )
  );
}

/** Observation frontiers reuse the bounded NIP-RS thread/message retention policy. */
export function threadSeenKey(rootId: string): string {
  return `thread:seen:v1:${rootId}`;
}

/** Exact evidence prevents a same-second sibling being acknowledged by a frontier. */
export function threadReplySeenKey(rootId: string, replyId: string): string {
  return `msg:seen:v1:${rootId}:${replyId}`;
}

/** Only this reply's observed body is positive evidence; progress frontiers are not. */
export function resolveThreadReplySeenAt(
  rootId: string,
  replyId: string,
  own: (key: string) => number | null,
): number | null {
  return own(threadReplySeenKey(rootId, replyId));
}

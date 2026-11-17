/** Observation frontiers reuse the bounded NIP-RS thread/message retention policy. */
export function threadSeenKey(rootId: string): string {
  return `thread:seen:v1:${rootId}`;
}

/** Exact evidence prevents a same-second sibling being acknowledged by a frontier. */
export function threadReplySeenKey(rootId: string, replyId: string): string {
  return `msg:seen:v1:${rootId}:${replyId}`;
}

/** A frontier never acknowledges an unobserved sibling at the same author time. */
export function resolveThreadReplySeenAt(
  rootId: string,
  replyId: string,
  own: (key: string) => number | null,
): number | null {
  const exact = own(threadReplySeenKey(rootId, replyId));
  const frontier = own(threadSeenKey(rootId));
  const before = frontier === null ? null : frontier - 1;
  if (exact === null) return before;
  return before === null ? exact : Math.max(exact, before);
}

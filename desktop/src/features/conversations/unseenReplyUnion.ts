/** Badge identity is canonical. Duplicate views contribute evidence, never extra counts. */
export function countUnseenReplyUnion(
  sources: Iterable<{
    communityId: string;
    channelId: string;
    replies: ReadonlyMap<string, readonly { id: string }[]>;
  }>,
): number {
  const identities = new Set<string>();
  for (const source of sources)
    for (const [rootId, replies] of source.replies)
      for (const reply of replies)
        identities.add(
          JSON.stringify([
            source.communityId,
            source.channelId,
            rootId,
            reply.id,
          ]),
        );
  return identities.size;
}

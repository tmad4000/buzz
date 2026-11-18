export function timelineScrollIdentity({
  channelId,
  viewInstanceId,
  mode,
  targetMessageId,
}: {
  channelId: string | null | undefined;
  viewInstanceId?: string;
  mode: "threads" | "timeline";
  targetMessageId?: string | null;
}) {
  const channel = channelId ?? "none";
  if (!viewInstanceId)
    return {
      domKey: channel,
      restorationId: targetMessageId
        ? `message-timeline:${channel}:target:${targetMessageId}`
        : `message-timeline:${channel}`,
    };
  // Encode quotes/delimiters because the router embeds this ID in a CSS
  // attribute selector. Mode changes retain the node but use a separate cache.
  return {
    domKey: `conversation-timeline:${encodeURIComponent(JSON.stringify([viewInstanceId, channel]))}`,
    restorationId: `conversation-timeline:v2:${encodeURIComponent(JSON.stringify([viewInstanceId, channel, mode, targetMessageId ?? null]))}`,
  };
}

import { getDispatchOrigin } from "../lib/dispatchTrace";
import type { TimelineMessage } from "../types";
import { useChannelNavigation } from "@/shared/context/ChannelNavigationContext";
export function DispatchOriginLine({
  message,
  channelId,
}: {
  message: TimelineMessage;
  channelId: string | null;
}) {
  const { channels } = useChannelNavigation();
  const origin = getDispatchOrigin(message, channelId);
  const channel = channels.find((channel) => channel.id === origin);
  return origin ? (
    <p
      className="mb-1 text-2xs text-muted-foreground"
      data-testid="dispatch-origin"
    >
      Written in {channel ? `#${channel.name}` : "this channel"} main
    </p>
  ) : null;
}

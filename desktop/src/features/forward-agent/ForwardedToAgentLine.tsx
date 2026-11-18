import { useIdentityQuery } from "@/shared/api/hooks";
import { useCommunities } from "@/features/communities/useCommunities";
import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useChannelNavigation } from "@/shared/context/ChannelNavigationContext";
import { forwardReceipts, useForwardReceiptRevision } from "./receipts";
import { forwardScope } from "./targets";
import { useForwardAgentEnabled } from "./preference";

export function ForwardedToAgentLine({
  channelId,
  messageId,
}: {
  channelId?: string | null;
  messageId: string;
}) {
  const enabled = useForwardAgentEnabled();
  return enabled && channelId ? (
    <ReceiptLine channelId={channelId} messageId={messageId} />
  ) : null;
}
function ReceiptLine({
  channelId,
  messageId,
}: {
  channelId: string;
  messageId: string;
}) {
  const signer = useIdentityQuery().data?.pubkey;
  const relay = useCommunities().activeCommunity?.relayUrl;
  const { goChannel } = useAppNavigation();
  const { channels } = useChannelNavigation();
  useForwardReceiptRevision();
  if (!signer || !relay) return null;
  try {
    const receipts = forwardReceipts(
      forwardScope(signer, relay),
      messageId,
    ).filter(
      (r) =>
        r.sourceChannelId === channelId &&
        channels.some(
          (c) => c.id === r.targetChannelId && c.isMember && !c.archivedAt,
        ),
    );
    return (
      <>
        {receipts.map((r) => (
          <div key={r.targetId} className="mb-1 text-xs text-muted-foreground">
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() =>
                void goChannel(r.targetChannelId, { messageId: r.targetId })
              }
            >
              Forwarded to {r.label} ↗
            </button>
          </div>
        ))}
      </>
    );
  } catch {
    return (
      <p className="text-xs text-muted-foreground">
        Forward marker history unavailable on this device.
      </p>
    );
  }
}

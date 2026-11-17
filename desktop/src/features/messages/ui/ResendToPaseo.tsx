import { useQueryClient } from "@tanstack/react-query";
import type { Identity } from "@/shared/api/types";
import * as React from "react";
import { Repeat2 } from "lucide-react";
import { toast } from "sonner";
import { useIdentityQuery } from "@/shared/api/hooks";
import {
  useChannelDetailsQuery,
  useChannelMembersQuery,
} from "@/features/channels/hooks";
import { DropdownMenuItem } from "@/shared/ui/dropdown-menu";
import type { TimelineMessage } from "../types";
import { hasResendMembership, isOwnEditedMessage } from "../resend/protocol";
import { requestPaseoResend } from "../resend/service";
import { useResendReceipt } from "../resend/useResendReceipt";

export function ResendToPaseoMenuItem({
  channelId,
  message,
}: {
  channelId?: string | null;
  message: TimelineMessage;
}) {
  const actor = useIdentityQuery().data?.pubkey;
  const queryClient = useQueryClient();
  const eligible = isOwnEditedMessage(message, actor, channelId);
  const channel = useChannelDetailsQuery(channelId ?? null, eligible);
  const members = useChannelMembersQuery(channelId ?? null, eligible);
  const receipt = useResendReceipt(
    channelId,
    actor,
    message.id,
    message.editEventId,
  );
  const [busy, setBusy] = React.useState(false);
  if (!eligible || !hasResendMembership(channel.data, members.data, actor))
    return null;
  const disabled = busy || Boolean(receipt && !receipt.error);
  const label =
    receipt?.phase === "sent"
      ? "Sent to Paseo"
      : receipt && !receipt.error
        ? "Pending"
        : receipt?.error
          ? "Retry resend to Paseo"
          : "Resend to Paseo";
  return (
    <DropdownMenuItem
      data-testid={`resend-to-paseo-${message.id}`}
      disabled={disabled}
      onSelect={() => {
        if (disabled || !channelId || !actor) return;
        setBusy(true);
        void requestPaseoResend(
          message,
          channelId,
          actor,
          () =>
            queryClient
              .getQueryData<Identity>(["identity"])
              ?.pubkey.toLowerCase() === actor.toLowerCase(),
        )
          .catch((error) => toast.error(String(error)))
          .finally(() => setBusy(false));
      }}
    >
      <Repeat2 className="h-4 w-4" />
      {label}
    </DropdownMenuItem>
  );
}
export function PaseoResendStatus({
  channelId,
  message,
}: {
  channelId?: string | null;
  message: TimelineMessage;
}) {
  const actor = useIdentityQuery().data?.pubkey;
  const receipt = useResendReceipt(
    channelId,
    actor,
    message.id,
    message.editEventId,
  );
  if (!receipt) return null;
  return (
    <span
      role="status"
      data-testid="paseo-resend-status"
      className="text-muted-foreground/70"
      title={
        receipt.error ??
        (receipt.phase === "sent"
          ? "Paseo acknowledged this resend"
          : "Awaiting Paseo acknowledgement")
      }
    >
      {receipt.phase === "sent" ? "Sent to Paseo" : "Pending"}
    </span>
  );
}

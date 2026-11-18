import { useFeatureEnabled } from "@/shared/features";
import * as React from "react";
import type { TimelineMessage } from "../types";
import {
  agentCardControlTarget,
  sendAgentControlTrigger,
} from "../lib/agentCardControl";
import { useIdentityQuery } from "@/shared/api/hooks";
import { getRelayHttpUrl } from "@/shared/api/tauri";
import { loadActiveCommunityId, loadCommunities } from "@/features/communities/communityStorage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogTrigger,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

import { parseBridgeStatusCard } from "../lib/bridgeStatusCard";
import { claimHold, controlRelayScope, getHold, holdSnapshot, reconcileHold, subscribeHolds, updateHold } from "../lib/agentControlHolds";

/** Publishes a request only. Lifecycle state always comes from a signed bridge edit. */
export function AgentCardControls({
  message,
  channelId,
}: {
  message: TimelineMessage;
  channelId?: string;
}) {
  const enabled = useFeatureEnabled("agentReplyUx");
  const identity = useIdentityQuery().data;
  const target = agentCardControlTarget(
    message,
    channelId,
    identity?.lost || identity?.locked || identity?.resetFailed
      ? undefined
      : identity?.pubkey,
  );
  const [communityId] = React.useState(loadActiveCommunityId);
  const activeCommunityId = loadActiveCommunityId();
  const live = React.useRef(true);
  React.useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const key = JSON.stringify([
    communityId,
    enabled,
    message.signerPubkey,
    identity?.lost,
    identity?.locked,
    identity?.resetFailed,
    channelId,
    message.id,
    message.body,
    message.tags,
    message.editSignerPubkey,
    message.bodyRevision,
    identity?.pubkey,
  ]);
  const currentKey = React.useRef(key);
  currentKey.current = key;
  const [confirmation, setConfirmation] = React.useState<string | null>(null);
  const relayScope = controlRelayScope(loadCommunities().find(c => c.id === communityId)?.relayUrl);
  const card = parseBridgeStatusCard(message);
  const holdKey = JSON.stringify([communityId, relayScope, identity?.pubkey, channelId, message.id, card?.serverId, card?.agentId]);
  const token = JSON.stringify([card?.source, card?.state, card?.source === "jacob" ? card.label : null, card?.resumeAvailable]);
  React.useSyncExternalStore(subscribeHolds, holdSnapshot);
  const hold = getHold(holdKey);
  const status = hold?.status ?? null;
  const group = React.useRef<HTMLDivElement>(null);
  const invoker = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (enabled && card && identity?.pubkey && relayScope)
      reconcileHold(holdKey, token, card.source, card.state, message.bodyRevision);
  }, [enabled, holdKey, token, relayScope, message.bodyRevision?.eventId, message.bodyRevision?.createdAt]);
  if (!enabled || !target || !communityId || !relayScope || activeCommunityId !== communityId)
    return null;
  const submit = async () => {
    if (
      !live.current ||

      status ||
      currentKey.current !== key ||
      loadActiveCommunityId() !== communityId
    )
      return;
    setConfirmation(null);
    const attemptId = claimHold(holdKey, target.command, token, message.bodyRevision);
    if (!attemptId) return;
    let publishing = false;
    try {
      const relayUrl = await getRelayHttpUrl();
      if (
        controlRelayScope(relayUrl) !== relayScope ||
        !live.current ||
        currentKey.current !== key ||
        loadActiveCommunityId() !== communityId
      )
        throw new Error("Card or community changed");
      publishing = true;
      await sendAgentControlTrigger(target, relayUrl);
      updateHold(holdKey, attemptId, "sent");
    } catch {
      // An ambiguous acceptance is never automatically retried.
      updateHold(holdKey, attemptId, publishing ? "unknown" : null);
    }
  };
  return (
    <div ref={group} tabIndex={-1} role="group" aria-label="Agent controls">
      <AlertDialog
        open={confirmation === key}
        onOpenChange={(open) => { if (!open) setConfirmation(null); }}
      >
        {target.command === "stop" ? (
          <AlertDialogTrigger asChild>
            <button ref={invoker} type="button" disabled={status !== null}
              className="min-h-11 rounded px-2 text-xs font-medium hover:bg-muted"
              onClick={() => setConfirmation(key)}>Stop…</button>
          </AlertDialogTrigger>
        ) : (
          <button type="button" className="min-h-11 rounded px-2 text-xs font-medium hover:bg-muted"
            disabled={status !== null} onClick={() => void submit()}>Continue</button>
        )}
        {status ? <span role="status" className="text-xs text-muted-foreground">
          {status === "sending" ? "Request pending. Waiting for the bridge to update this card."
            : status === "sent" ? "Request sent. Waiting for the bridge to update this card."
            : "Delivery unconfirmed. Check this card before sending another request."}
        </span> : null}
        <AlertDialogContent onCloseAutoFocus={(event) => {
          if (!invoker.current || invoker.current.disabled) {
            event.preventDefault();
            group.current?.focus();
          }
        }}>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this agent’s current turn?</AlertDialogTitle>
            <AlertDialogDescription>
              Request an interruption for {target.card.title} (
              {target.card.agentId}). The underlying task remains unfinished.
              Wait for the bridge’s result.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()}>
              Send Stop request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useFeatureEnabled } from "@/shared/features";
import * as React from "react";
import type { TimelineMessage } from "../types";
import {
  agentCardControlTarget,
  sendAgentControlTrigger,
} from "../lib/agentCardControl";
import { useIdentityQuery } from "@/shared/api/hooks";
import { getRelayHttpUrl } from "@/shared/api/tauri";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";

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
    identity?.pubkey,
  ]);
  const currentKey = React.useRef(key);
  currentKey.current = key;
  const [confirmation, setConfirmation] = React.useState<string | null>(null);
  const [attempt, setAttempt] = React.useState<{
    key: string;
    status: "sending" | "sent" | "unknown";
  } | null>(null);
  const inFlight = React.useRef(false);
  if (!enabled || !target || !communityId || activeCommunityId !== communityId)
    return null;
  const status = attempt?.key === key ? attempt.status : null;
  const submit = async () => {
    if (
      !live.current ||
      inFlight.current ||
      status ||
      currentKey.current !== key ||
      loadActiveCommunityId() !== communityId
    )
      return;
    inFlight.current = true;
    setConfirmation(null);
    setAttempt({ key, status: "sending" });
    try {
      const relayUrl = await getRelayHttpUrl();
      if (
        !live.current ||
        currentKey.current !== key ||
        loadActiveCommunityId() !== communityId
      )
        throw new Error("Card or community changed");
      await sendAgentControlTrigger(target, relayUrl);
      if (live.current) setAttempt({ key, status: "sent" });
    } catch {
      // An ambiguous acceptance is never automatically retried.
      if (live.current) setAttempt({ key, status: "unknown" });
    } finally {
      inFlight.current = false;
    }
  };
  return (
    <>
      <button
        type="button"
        className="min-h-11 rounded px-2 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
        disabled={status !== null}
        onClick={() =>
          target.command === "stop" ? setConfirmation(key) : void submit()
        }
      >
        {target.command === "stop" ? "Stop…" : "Continue"}
      </button>
      {status ? (
        <span role="status" className="text-xs text-muted-foreground">
          {status === "sending"
            ? "Sending request…"
            : status === "sent"
              ? "Request sent. Waiting for the bridge to update this card."
              : "Delivery unconfirmed. Check this card before sending another request."}
        </span>
      ) : null}
      <AlertDialog
        open={confirmation === key}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <AlertDialogContent>
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
    </>
  );
}

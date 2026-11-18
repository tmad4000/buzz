import { parseBridgeStatusCard } from "./bridgeStatusCard";
import { getThreadReference } from "./threading";
import type { TimelineMessage } from "../types";
import { sendChannelMessage } from "@/shared/api/tauriMessages";

/** Only this established viewer identity may publish the bridge control trigger. */
export const JACOB_CONTROL_SIGNER =
  "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
const ROOT_AGENT = "d3caa262-cdcd-454d-9d42-0cd05ac69156";
/** Existing bridge command vocabulary; no runtime RPC is issued by the client. */
export type AgentControlCommand = "stop" | "continue";

/** Display eligibility only; the bridge's current ledger/scope proof is authoritative. */
export function agentCardControlTarget(
  message: TimelineMessage,
  channelId: string | undefined,
  signer: string | undefined,
) {
  const card = parseBridgeStatusCard(message);
  const channels = message.tags?.filter((tag) => tag[0] === "h") ?? [];
  if (
    !card ||
    card.agentId === ROOT_AGENT ||
    signer !== JACOB_CONTROL_SIGNER ||
    message.pending ||
    !/^[0-9a-f]{64}$/.test(message.id) ||
    !channelId ||
    channels.length !== 1 ||
    channels[0][1] !== channelId
  )
    return null;
  const command: AgentControlCommand | null =
    card.state === "stopped"
      ? card.resumeAvailable
        ? "continue"
        : null
      : [
            "progress",
            "seen",
            "waiting",
            "overdue",
            "continuation",
            "interrupted",
          ].includes(card.state)
        ? "stop"
        : null;
  if (!command) return null;
  return {
    card,
    command,
    channelId,
    cardId: message.id,
    rootId: getThreadReference(message.tags ?? []).rootId ?? message.id,
  };
}

/** Emit only the existing direct-card reply trigger, signed by the native sender. */
export function sendAgentControlTrigger(
  target: NonNullable<ReturnType<typeof agentCardControlTarget>>,
  relayUrl: string,
) {
  return sendChannelMessage(
    target.channelId,
    target.command,
    target.cardId,
    undefined,
    undefined,
    9,
    undefined,
    undefined,
    undefined,
    undefined,
    relayUrl,
    JACOB_CONTROL_SIGNER,
    target.rootId,
  );
}

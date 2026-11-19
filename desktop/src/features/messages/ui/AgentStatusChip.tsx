import type { TimelineMessage } from "../types";
import { AgentCardControls } from "./AgentCardControls";
import type { parseBridgeStatusCard } from "@/features/messages/lib/bridgeStatusCard";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import { openPaseoAgent } from "@/shared/lib/openPaseoAgent";

type Card = NonNullable<ReturnType<typeof parseBridgeStatusCard>>;

/** Compact, source-labeled compatibility view of an existing signed status card. */
export function AgentStatusChip({
  card,
  originalBody,
  message,
  channelId,
}: {
  card: Card;
  originalBody: string;
  message?: TimelineMessage;
  channelId?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      <details className="min-w-0 max-w-full">
        <summary className="cursor-pointer rounded px-1 py-1 focus-visible:outline-2 focus-visible:outline-primary">
          {card.label} · {card.title}
        </summary>
        <div className="space-y-1 px-1 py-2">
          <p>
            {card.provider} · Reported model: {card.model}
          </p>
          <p>
            Reported status · source: {card.source}. Live activity unverified.
          </p>
          {card.metadataUnavailable ? <p>{card.metadataUnavailable}</p> : null}
          <button
            type="button"
            className="min-h-11 shrink-0 rounded px-1 underline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={`Open agent ${card.title}`}
            onClick={() => void openPaseoAgent(card.href)}
          >
            Open agent ↗
          </button>
          <pre className="whitespace-pre-wrap break-words">{originalBody}</pre>
          <p className="break-all">
            Agent {card.agentId} · server {card.serverId}
          </p>
          <button
            type="button"
            className="min-h-11 underline"
            onClick={() =>
              copyTextToClipboard(
                `${card.agentId} · ${card.serverId}`,
                "Agent IDs copied",
              )
            }
          >
            Copy agent and server IDs
          </button>
        </div>
      </details>
      {message ? (
        <AgentCardControls message={message} channelId={channelId} />
      ) : null}
    </div>
  );
}

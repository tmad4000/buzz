import { Bot, ChevronRight } from "lucide-react";

import {
  type AskContactAgentCandidate,
  type AskContactAgentPlace,
  askContactAgentStatusText,
  possessiveName,
  soleAskTarget,
} from "@/features/agents/lib/askContactAgent";
import { useAskContactAgent } from "@/features/agents/useAskContactAgent";
import { cn } from "@/shared/lib/cn";

function audienceText(place: AskContactAgentPlace) {
  return `#${place.channelName} · visible to ${place.memberCount} ${place.memberCount === 1 ? "member" : "members"}`;
}

function AgentStatus({
  status,
}: {
  status: AskContactAgentCandidate["status"];
}) {
  if (status === "online") return null;
  return (
    <span className="text-xs text-muted-foreground">
      {status === "away"
        ? " · Away"
        : status === "offline"
          ? " · Offline, may answer later"
          : " · Status unknown"}
    </span>
  );
}

function AskTargetButton({
  agent,
  place,
  label,
  onAsk,
  primary,
}: {
  agent: AskContactAgentCandidate;
  place: AskContactAgentPlace;
  label: string;
  onAsk: (agent: AskContactAgentCandidate, place: AskContactAgentPlace) => void;
  primary?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        primary ? "bg-muted hover:bg-muted/80" : "hover:bg-muted/60",
      )}
      data-testid={`ask-contact-agent-${agent.pubkey}-${place.channelId}`}
      onClick={() => onAsk(agent, place)}
      type="button"
    >
      <Bot aria-hidden="true" className="h-4 w-4 shrink-0 text-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {agent.name} · {audienceText(place)}
          <AgentStatus status={agent.status} />
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 text-muted-foreground"
      />
    </button>
  );
}

/**
 * "Ask <name>'s agent" on a person's profile: one explicit entry point to an
 * opted-in agent the contact owns, in a channel both people already share.
 * Choosing a target only pre-addresses the channel draft; the user still
 * writes and sends the question.
 */
export function ProfileAskAgentSection({
  contactName,
  contactPubkey,
  enabled,
}: {
  contactName: string;
  contactPubkey: string | null;
  enabled: boolean;
}) {
  const { resolution, ask } = useAskContactAgent(contactPubkey, enabled);
  if (!enabled || resolution.kind === "none") return null;

  const title = `Ask ${possessiveName(contactName)} agent`;
  const statusText = askContactAgentStatusText(resolution, contactName);
  const sole = soleAskTarget(resolution);

  return (
    <section
      aria-label={title}
      className="space-y-1.5"
      data-testid="profile-ask-agent"
    >
      {sole ? (
        <AskTargetButton
          agent={sole.agent}
          label={title}
          onAsk={ask}
          place={sole.place}
          primary
        />
      ) : (
        <>
          <h3 className="px-1 text-xs font-medium text-muted-foreground">
            {title}
          </h3>
          {resolution.kind === "ready" ? (
            <div
              className="space-y-0.5 rounded-xl bg-muted/40 p-1"
              data-testid="profile-ask-agent-choices"
            >
              {resolution.candidates.flatMap((agent) =>
                agent.places.map((place) => (
                  <AskTargetButton
                    agent={agent}
                    key={`${agent.pubkey}:${place.channelId}`}
                    label={`Ask ${agent.name} in #${place.channelName}`}
                    onAsk={ask}
                    place={place}
                  />
                )),
              )}
            </div>
          ) : null}
        </>
      )}
      {statusText ? (
        <p
          className="px-1 text-xs text-muted-foreground"
          data-testid="profile-ask-agent-status"
          role="status"
        >
          {statusText}
        </p>
      ) : null}
      {resolution.kind === "ready" ? (
        <p className="px-1 text-xs text-muted-foreground/80">
          Replies come from the agent, not from {contactName}.
        </p>
      ) : null}
    </section>
  );
}

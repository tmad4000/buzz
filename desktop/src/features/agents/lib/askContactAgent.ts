import type { Channel, RelayAgent } from "@/shared/api/types";
import { normalizePubkey } from "@/shared/lib/pubkey";
import {
  isAgentMentionChannelType,
  relayAgentCanRespondInChannel,
} from "./agentAutocompleteEligibility";

/**
 * "Ask <name>'s agent": which of a contact's agents the viewer may ask, and
 * where.
 *
 * Eligibility is deliberately the existing policy, not a new one:
 * - the agent's owner is the contact by the relay directory's verified owner
 *   (NIP-OA attestation), never by a name or profile text match;
 * - the agent's owner-signed respond-to policy admits the viewer in a channel
 *   both of them already belong to (`relayAgentCanRespondInChannel`);
 * - the channel is a stream or forum, where agent mentions are supported.
 *
 * The result only chooses a destination. Sending still goes through the
 * composer's publish-time revalidation, which fails closed.
 */

export type AskContactAgentPlace = {
  channelId: string;
  channelName: string;
  /** Everyone in the channel can read the question and the reply. */
  memberCount: number;
};

export type AskContactAgentCandidate = {
  pubkey: string;
  name: string;
  status: RelayAgent["status"];
  /** Smallest audience first, so the most private common thread leads. */
  places: AskContactAgentPlace[];
};

export type AskContactAgentResolution =
  | { kind: "loading" }
  | { kind: "unavailable"; reason: "directory-error" }
  | { kind: "none" }
  | { kind: "not-shared"; agentCount: number }
  | { kind: "ready"; candidates: AskContactAgentCandidate[] };

export function resolveAskContactAgent({
  contactPubkey,
  currentPubkey,
  relayAgents,
  relayAgentsError,
  channels,
}: {
  contactPubkey: string;
  currentPubkey: string | null | undefined;
  relayAgents: readonly RelayAgent[] | undefined;
  relayAgentsError?: unknown;
  channels: readonly Channel[] | undefined;
}): AskContactAgentResolution {
  if (relayAgentsError)
    return { kind: "unavailable", reason: "directory-error" };
  if (!relayAgents || !channels || !currentPubkey) return { kind: "loading" };

  const contact = normalizePubkey(contactPubkey);
  const viewer = normalizePubkey(currentPubkey);
  if (contact === viewer) return { kind: "none" };

  const owned = relayAgents.filter(
    (agent) =>
      agent.ownerPubkey !== null &&
      normalizePubkey(agent.ownerPubkey) === contact &&
      normalizePubkey(agent.pubkey) !== contact,
  );
  if (owned.length === 0) return { kind: "none" };

  const sharedChannels = channels.filter(
    (channel) =>
      channel.isMember &&
      channel.archivedAt === null &&
      isAgentMentionChannelType(channel.channelType),
  );

  const candidates: AskContactAgentCandidate[] = [];
  const seen = new Set<string>();
  for (const agent of owned) {
    const pubkey = normalizePubkey(agent.pubkey);
    if (seen.has(pubkey)) continue;
    seen.add(pubkey);
    const places = sharedChannels
      .filter((channel) =>
        relayAgentCanRespondInChannel(agent, channel.id, viewer),
      )
      .map((channel) => ({
        channelId: channel.id,
        channelName: channel.name,
        memberCount: channel.memberCount,
      }))
      .sort(
        (a, b) =>
          a.memberCount - b.memberCount ||
          a.channelName.localeCompare(b.channelName),
      );
    if (places.length > 0) {
      candidates.push({
        pubkey,
        name: agent.name.trim() || "Agent",
        status: agent.status,
        places,
      });
    }
  }

  if (candidates.length === 0) {
    return { kind: "not-shared", agentCount: seen.size };
  }
  candidates.sort((a, b) => a.name.localeCompare(b.name));
  return { kind: "ready", candidates };
}

/** A single unambiguous target, or null when the user must choose. */
export function soleAskTarget(
  resolution: AskContactAgentResolution,
): { agent: AskContactAgentCandidate; place: AskContactAgentPlace } | null {
  if (resolution.kind !== "ready") return null;
  const [agent, ...others] = resolution.candidates;
  if (!agent || others.length > 0 || agent.places.length !== 1) return null;
  return { agent, place: agent.places[0] };
}

export function possessiveName(name: string): string {
  const trimmed = name.trim() || "Their";
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}

export function askContactAgentStatusText(
  resolution: AskContactAgentResolution,
  contactName: string,
): string | null {
  const owner = possessiveName(contactName);
  switch (resolution.kind) {
    case "loading":
      return "Checking for agents you can ask…";
    case "unavailable":
      return "Couldn't check agents right now. Try again in a moment.";
    case "none":
      return null;
    case "not-shared":
      return `${owner} ${resolution.agentCount === 1 ? "agent hasn't" : "agents haven't"} opted in to answer you in a channel you share.`;
    case "ready":
      return null;
  }
}

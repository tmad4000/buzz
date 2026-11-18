import type { Channel } from "@/shared/api/types";
import type { TimelineMessage } from "@/features/messages/types";
import { buildMessageLink } from "@/features/messages/lib/messageLink";
import { resolveChannelDisplayLabel } from "@/features/sidebar/lib/channelLabels";
import type { ChannelSectionStore } from "@/features/sidebar/lib/channelSectionsStorage";

export type AgentLane = {
  channel: Channel;
  label: string;
  agentPubkeys: string[];
};
export function canForwardSource(
  message: TimelineMessage,
  channelId?: string | null,
): boolean {
  return (
    Boolean(channelId) &&
    !message.pending &&
    (message.kind === 9 || message.kind === 40002) &&
    /^[0-9a-f]{64}$/.test(message.id) &&
    message.body.trim().length > 0
  );
}
const members = (c: Channel) => [
  ...new Set(c.channelType === "dm" ? c.participantPubkeys : c.memberPubkeys),
];
export function sendableLane(channel: Channel, signer: string): boolean {
  return (
    channel.isMember &&
    !channel.archivedAt &&
    (channel.channelType === "stream" || channel.channelType === "dm") &&
    members(channel).includes(signer)
  );
}
/** Sidebar membership is authoritative; a renamed seed section keeps its ID. */
export function directAgentLanes(
  channels: Channel[],
  sections: ChannelSectionStore,
  seedSectionIds: string[],
  signer: string,
  knownAgents: ReadonlySet<string>,
): AgentLane[] {
  const ids = new Set(
    sections.sections
      .filter(
        (s) => seedSectionIds.includes(s.id) || s.name === "Direct agents",
      )
      .map((s) => s.id),
  );
  return channels
    .filter(
      (c) =>
        ids.has(sections.assignments[c.id] ?? "") && sendableLane(c, signer),
    )
    .map((channel) => {
      const peers = members(channel).filter((pk) => pk !== signer);
      const agents = peers.filter((pk) => knownAgents.has(pk));
      return {
        channel,
        label: resolveChannelDisplayLabel(channel, signer, undefined),
        agentPubkeys: agents.length ? agents : peers.length === 1 ? peers : [],
      };
    });
}
/** No recursive tiers: only an unambiguous, same-participant Paseo DM ↔ P2 pair. */
export function defaultAgentLane(
  sourceId: string,
  lanes: AgentLane[],
): { lane: AgentLane; label: string } | null {
  const source = lanes.find((l) => l.channel.id === sourceId);
  if (!source) return null;
  const sourceIsDm =
    source.channel.channelType === "dm" && source.label === "Paseo";
  const sourceIsP2 =
    source.channel.channelType === "stream" &&
    ["Paseo P2", "P2"].includes(source.label);
  if (!sourceIsDm && !sourceIsP2) return null;
  const pair = members(source.channel).sort().join(",");
  if (
    members(source.channel).length !== 2 ||
    source.channel.visibility !== "private"
  )
    return null;
  const matches = lanes.filter(
    (l) =>
      l.channel.id !== sourceId &&
      l.channel.visibility === "private" &&
      members(l.channel).length === 2 &&
      members(l.channel).sort().join(",") === pair &&
      (sourceIsDm
        ? l.channel.channelType === "stream" &&
          ["Paseo P2", "P2"].includes(l.label)
        : l.channel.channelType === "dm" && l.label === "Paseo"),
  );
  const match = matches.length === 1 ? matches[0] : undefined;
  return match
    ? { lane: match, label: sourceIsDm ? "P2 (later)" : "Paseo DM (now)" }
    : null;
}
function markdownText(value: string) {
  return value
    .replace(/[\\`*_{}[\]<>]/g, "\\$&")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 160);
}
/** Quote, never move/delete the original. No thread-parent or forwarded mention metadata. */
export function linkedForward(
  sourceChannelId: string,
  message: TimelineMessage,
): string {
  if (!canForwardSource(message, sourceChannelId))
    throw new Error("Only delivered text messages can be forwarded.");
  const backlink = buildMessageLink({
    channelId: sourceChannelId,
    messageId: message.id,
    threadRootId: message.rootId,
  });
  const content = `Forwarded from ${markdownText(message.author)}:\n\n${message.body
    .split(/\r\n|\r|\n/)
    .map((line) => `> ${line}`)
    .join("\n")}\n\n[Original message ↗](${backlink})`;
  if (new TextEncoder().encode(content).length > 48_000)
    throw new Error(
      "This forward is too large. Open the source and send a shorter excerpt.",
    );
  return content;
}

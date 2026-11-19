import type { Channel, ChannelMember } from "@/shared/api/types";
import {
  getChannelDetails,
  getChannelMembers,
} from "@/shared/api/tauriChannels";

export type ForwardAudience = { channel: Channel; members: ChannelMember[] };
export type ForwardAudiences = {
  source: ForwardAudience;
  target: ForwardAudience;
};
const keys = (a: ForwardAudience) =>
  [...new Set(a.members.map((m) => m.pubkey))].sort();
/** Only the same known private audience can skip confirmation. Public access is always named. */
export function needsAudienceConfirmation(a: ForwardAudiences): boolean {
  return (
    a.source.channel.visibility !== "private" ||
    a.target.channel.visibility !== "private" ||
    JSON.stringify(keys(a.source)) !== JSON.stringify(keys(a.target))
  );
}
/** Membership/visibility/target-name changes invalidate an earlier confirmation. */
export function audienceKey(a: ForwardAudiences): string {
  return JSON.stringify([
    a.source.channel.id,
    a.source.channel.channelType,
    a.source.channel.visibility,
    keys(a.source),
    a.target.channel.id,
    a.target.channel.channelType,
    a.target.channel.visibility,
    a.target.channel.name,
    keys(a.target),
  ]);
}
export function audienceDescription(a: ForwardAudience): string {
  return a.channel.visibility === "open"
    ? `Open channel “${a.channel.name}”: community members who can access or join it, including people beyond the current member list.`
    : `Private ${a.channel.channelType === "dm" ? "conversation" : "channel"} “${a.channel.name}”: ${a.members.length} current members.`;
}
/** Read fresh details and writer-side rosters; incomplete/unknown audiences never bypass consent. */
export async function readForwardAudiences(
  sourceId: string,
  targetId: string,
  signer: string,
  relayUrl: string,
  io = { getChannelDetails, getChannelMembers },
): Promise<ForwardAudiences> {
  if (!relayUrl) throw new Error("No captured forwarding relay.");
  const options = {
    readYourWrites: true,
    requireComplete: true,
    expectedScope: { relayUrl, signerPubkey: signer },
  };
  const [source, target, sourceMembers, targetMembers] = await Promise.all([
    io.getChannelDetails(sourceId, options),
    io.getChannelDetails(targetId, options),
    io.getChannelMembers(sourceId, options),
    io.getChannelMembers(targetId, options),
  ]);
  const validate = (channel: Channel, members: ChannelMember[], id: string) => {
    if (
      channel.id !== id ||
      !channel.isMember ||
      channel.archivedAt ||
      !members.some((m) => m.pubkey === signer) ||
      new Set(members.map((m) => m.pubkey)).size !== members.length
    )
      throw new Error(
        "The full current audience could not be verified. Reopen the destination picker.",
      );
  };
  validate(source, sourceMembers, sourceId);
  validate(target, targetMembers, targetId);
  const complete = (channel: Channel, members: ChannelMember[]): Channel => ({
    ...channel,
    memberCount: members.length,
    memberPubkeys: members.map((m) => m.pubkey),
    participantPubkeys:
      channel.channelType === "dm" ? members.map((m) => m.pubkey) : [],
    participants:
      channel.channelType === "dm"
        ? members.map((m) => m.displayName ?? m.pubkey)
        : [],
  });
  return {
    source: {
      channel: complete(source, sourceMembers),
      members: sourceMembers,
    },
    target: {
      channel: complete(target, targetMembers),
      members: targetMembers,
    },
  };
}

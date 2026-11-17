import type { Channel, ChannelMember, RelayEvent } from "@/shared/api/types";
import type { TimelineMessage } from "../types";

export const PASEO_PUBKEY =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
export const RESEND_TAG = "paseo-resend-v1";
const hexId = (value: string | undefined): value is string =>
  Boolean(value && /^[0-9a-f]{64}$/i.test(value));
const lower = (value?: string) => value?.toLowerCase();
export function isOwnEditedMessage(
  message: TimelineMessage,
  actor?: string,
  channel?: string | null,
) {
  return Boolean(
    channel &&
      actor &&
      !message.pending &&
      message.edited &&
      hexId(message.id) &&
      hexId(message.editEventId) &&
      lower(message.pubkey) === lower(actor) &&
      lower(message.signerPubkey) === lower(actor) &&
      (message.kind === 9 || message.kind === 40002) &&
      message.tags?.some((tag) => tag[0] === "h" && tag[1] === channel),
  );
}
export function hasResendMembership(
  channel: Channel | undefined,
  members: ChannelMember[] | undefined,
  actor?: string,
) {
  return Boolean(
    channel?.isMember &&
      !channel.archivedAt &&
      actor &&
      members?.some((m) => lower(m.pubkey) === lower(actor)) &&
      members?.some((m) => lower(m.pubkey) === PASEO_PUBKEY),
  );
}
export function resendTemplate(
  channel: string,
  original: string,
  edit: string,
) {
  if (!channel || !hexId(original) || !hexId(edit))
    throw new Error("Missing resend target.");
  return {
    kind: 7,
    content: "🔁",
    tags: [
      ["h", channel],
      ["e", original],
      ["edit", edit],
      ["t", RESEND_TAG],
    ],
  };
}
function oneTag(event: RelayEvent, tag: string, value: string) {
  const matches = event.tags.filter((t) => t[0] === tag);
  return matches.length === 1 && matches[0][1] === value;
}
/** Events come from the authenticated relay, which validates Nostr signatures. */
export function isPaseoAcknowledgement(
  event: RelayEvent,
  channel: string,
  trigger: string,
) {
  return (
    event.kind === 7 &&
    event.pubkey.toLowerCase() === PASEO_PUBKEY &&
    event.content === "👀" &&
    (event.tags.filter((t) => t[0] === "h").length === 0 ||
      oneTag(event, "h", channel)) &&
    oneTag(event, "e", trigger)
  );
}
export function receiptKey(
  community: string | null,
  actor: string,
  channel: string,
  original: string,
  edit: string,
) {
  return JSON.stringify([
    community,
    actor.toLowerCase(),
    channel,
    original,
    edit,
  ]);
}

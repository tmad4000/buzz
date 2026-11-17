import { getIdentity } from "@/shared/api/tauriIdentity";
import type { TimelineMessage } from "../types";
import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import {
  getChannelDetails,
  getChannelMembers,
} from "@/shared/api/tauriChannels";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import {
  hasResendMembership,
  isOwnEditedMessage,
  receiptKey,
  resendTemplate,
} from "./protocol";
import { getResendReceipt, setResendReceipt } from "./receiptStore";
const inFlight = new Map<string, Promise<void>>();
const defaults = {
  sign: signRelayEvent,
  publish: relayClient.publishEvent.bind(relayClient),
  details: getChannelDetails,
  members: getChannelMembers,
  community: loadActiveCommunityId,
  identity: getIdentity,
};
export function requestPaseoResend(
  message: TimelineMessage,
  channel: string,
  actor: string,
  isCurrentIdentity: () => boolean,
  deps = defaults,
) {
  const community = deps.community();
  const originalId = message.id;
  const editId = message.editEventId ?? "";
  const key = receiptKey(community, actor, channel, originalId, editId);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const current = () => deps.community() === community && isCurrentIdentity();
  const run = (async () => {
    if (!isOwnEditedMessage(message, actor, channel))
      throw new Error("Only your delivered edited messages can be resent.");
    const [detail, members] = await Promise.all([
      deps.details(channel),
      deps.members(channel),
    ]);
    if (!current())
      throw new Error("Community changed. Open the message again to resend.");
    if (!hasResendMembership(detail, members, actor))
      throw new Error("You and Paseo must still be channel members.");
    if (
      (await deps.identity()).pubkey.toLowerCase() !== actor.toLowerCase() ||
      !current()
    )
      throw new Error("Identity changed. Open the message again to resend.");
    const old = getResendReceipt(key);
    if (old?.phase === "sent" || (old && !old.error)) return;
    const event =
      old?.event ??
      (await deps.sign(resendTemplate(channel, originalId, editId)));
    if (!current() || event.pubkey.toLowerCase() !== actor.toLowerCase())
      throw new Error("Identity changed. Open the message again to resend.");
    if (
      (await deps.identity()).pubkey.toLowerCase() !== actor.toLowerCase() ||
      !current()
    )
      throw new Error("Identity changed. Open the message again to resend.");
    setResendReceipt(key, { event, phase: "pending" });
    try {
      await deps.publish(
        event,
        "Resend request timed out",
        "Could not request resend",
        current,
      );
    } catch (error) {
      // A late rejection cannot erase an acknowledgement already observed.
      if (getResendReceipt(key)?.phase !== "sent")
        setResendReceipt(key, {
          event,
          phase: "pending",
          error: String(error),
        });
      throw error;
    }
  })();
  inFlight.set(key, run);
  void run.finally(() => inFlight.delete(key)).catch(() => {});
  return run;
}

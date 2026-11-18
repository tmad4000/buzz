import * as React from "react";
import { forwardFailureMessage } from "./delivery";
import { toast } from "sonner";
import type { Channel } from "@/shared/api/types";
import type { TimelineMessage } from "@/features/messages/types";
import type { useSendMessageMutation } from "@/features/messages/hooks";
import { defaultAgentLane, directAgentLanes, linkedForward } from "./model";
import {
  audienceKey,
  needsAudienceConfirmation,
  readForwardAudiences,
  type ForwardAudiences,
} from "./audience";
import { forwardOnce, forwardRevision } from "./receipts";
import { readForwardSections } from "./targets";

type Intent = {
  targetId: string;
  label: string;
  isDefault: boolean;
  message: TimelineMessage;
  note: string;
};
type Pending = { intent: Intent; audiences: ForwardAudiences };
type Input = {
  channelId?: string | null;
  message: TimelineMessage;
  signer?: string;
  relayUrl?: string;
  scope: string;
  channels: Channel[];
  known: ReadonlySet<string>;
  sectionIds?: string[];
  send: ReturnType<typeof useSendMessageMutation>["mutateAsync"];
  closeMenu: () => void;
};
/** Consent belongs to this source/signer/relay and a specific fresh audience, never a generic boolean. */
export function useForwardAgentSend(input: Input) {
  const {
    channelId,
    message,
    signer,
    relayUrl,
    scope,
    sectionIds,
    send,
    closeMenu,
  } = input;
  const latest = React.useRef(input);
  latest.current = input;
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState<Pending | null>(null);
  const lock = React.useRef(false);
  const activeOwner = `${scope}:${message.id}`;
  const ownerRef = React.useRef(activeOwner);
  ownerRef.current = activeOwner;
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: New source/scope clears only its own interaction state.
  React.useEffect(() => {
    lock.current = false;
    setBusy(false);
    setNote("");
    setPending(null);
  }, [activeOwner]);
  const ownsUi = () => mounted.current && ownerRef.current === activeOwner;
  const run = async (intent: Intent, confirmedAudience?: string) => {
    if (lock.current || !signer || !relayUrl || !channelId || !sectionIds)
      return;
    lock.current = true;
    setBusy(true);
    closeMenu();
    let publicationStarted = false;
    try {
      const validateDestination = () => {
        const now = latest.current;
        if (
          !ownsUi() ||
          now.scope !== scope ||
          now.signer !== signer ||
          now.relayUrl !== relayUrl ||
          now.channelId !== channelId ||
          !now.sectionIds
        )
          throw new Error("Forward scope changed. Reopen the picker.");
        const current = directAgentLanes(
          now.channels,
          readForwardSections(signer, relayUrl),
          now.sectionIds,
          signer,
          now.known,
        );
        const lane = current.find(
          (l) => l.channel.id === intent.targetId && l.channel.id !== channelId,
        );
        if (!lane || lane.agentPubkeys.length !== 1)
          throw new Error(
            "Destination changed or has no single agent. Reopen the picker.",
          );
        if (
          intent.isDefault &&
          defaultAgentLane(channelId, current)?.lane.channel.id !==
            intent.targetId
        )
          throw new Error("Default destination changed. Reopen the picker.");
        return lane;
      };
      const lane = validateDestination();
      const content = linkedForward(channelId, intent.message, {
        senderNote: intent.note,
        senderPubkey: signer,
      });
      const revision = await forwardRevision(content);
      const audiences = await readForwardAudiences(
        channelId,
        intent.targetId,
        signer,
      );
      if (!ownsUi()) return;
      if (
        !audiences.target.members.some((m) => m.pubkey === lane.agentPubkeys[0])
      )
        throw new Error(
          "The selected agent left this audience. Reopen the picker.",
        );
      if (
        intent.isDefault &&
        (audiences.source.members.length !== 2 ||
          audiences.target.members.length !== 2 ||
          needsAudienceConfirmation(audiences))
      )
        throw new Error(
          "The default lane audience changed. Choose the destination explicitly.",
        );
      if (
        needsAudienceConfirmation(audiences) &&
        confirmedAudience !== audienceKey(audiences)
      ) {
        setPending({ intent, audiences });
        if (confirmedAudience)
          toast.error(
            "The audience changed. Review and confirm the current recipients again.",
          );
        return;
      }
      setPending(null);
      const receipt = await forwardOnce(
        scope,
        channelId,
        intent.message.id,
        intent.targetId,
        intent.isDefault
          ? lane.channel.channelType === "stream"
            ? "P2"
            : "Paseo DM"
          : intent.label,
        () => {
          const liveLane = validateDestination();
          if (liveLane.agentPubkeys[0] !== lane.agentPubkeys[0])
            throw new Error("Destination agent changed. Reopen the picker.");
          publicationStarted = true;
          return send({
            targetChannel: audiences.target.channel,
            channelId: intent.targetId,
            content,
            mentionPubkeys: lane.agentPubkeys,
            parentEventId: null,
            transport: "http",
            expectedScope: { relayUrl, signerPubkey: signer },
          });
        },
        signer,
        revision,
      );
      if (ownsUi()) toast.success(`Forwarded to ${receipt.label}`);
    } catch (error) {
      if (ownsUi()) {
        toast.error(forwardFailureMessage(error, publicationStarted));
      }
    } finally {
      if (ownsUi()) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  return {
    busy,
    note,
    setNote,
    pending,
    forward: (targetId: string, label: string, isDefault = false) =>
      run({ targetId, label, isDefault, message, note }),
    confirm: () =>
      pending
        ? run(pending.intent, audienceKey(pending.audiences))
        : Promise.resolve(),
    cancel: () => {
      if (!lock.current) setPending(null);
    },
  };
}

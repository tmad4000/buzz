import * as React from "react";

import { useAppNavigation } from "@/app/navigation/useAppNavigation";
import { useRelayAgentsQuery } from "@/features/agents/hooks";
import {
  type AskContactAgentCandidate,
  type AskContactAgentPlace,
  resolveAskContactAgent,
} from "@/features/agents/lib/askContactAgent";
import { useChannelsQuery } from "@/features/channels/hooks";
import { requestDraftAddressSeed } from "@/features/messages/lib/draftAddressSeeds";
import { useIdentityQuery } from "@/shared/api/hooks";

/**
 * Put an explicit, pubkey-pinned @mention of the agent at the front of the
 * channel's main composer (draft key = channel id). Nothing is sent: the user
 * writes the question and sends it through the normal composer, whose
 * publish-time revalidation is the authority. Repeating the action never
 * duplicates the mention.
 */
export function seedAskAgentDraft(
  agent: Pick<AskContactAgentCandidate, "name" | "pubkey">,
  channelId: string,
) {
  requestDraftAddressSeed(channelId, {
    pubkey: agent.pubkey,
    displayName: agent.name,
  });
}

export function useAskContactAgent(
  contactPubkey: string | null,
  enabled: boolean,
) {
  const active = enabled && contactPubkey !== null;
  const relayAgentsQuery = useRelayAgentsQuery({ enabled: active });
  const channelsQuery = useChannelsQuery({ enabled: active });
  const identityQuery = useIdentityQuery();
  const { goChannel } = useAppNavigation();

  const resolution = React.useMemo(
    () =>
      contactPubkey
        ? resolveAskContactAgent({
            contactPubkey,
            currentPubkey: identityQuery.data?.pubkey,
            relayAgents: relayAgentsQuery.data,
            relayAgentsError: relayAgentsQuery.error,
            channels: channelsQuery.data,
          })
        : ({ kind: "none" } as const),
    [
      contactPubkey,
      identityQuery.data?.pubkey,
      relayAgentsQuery.data,
      relayAgentsQuery.error,
      channelsQuery.data,
    ],
  );

  const ask = React.useCallback(
    (agent: AskContactAgentCandidate, place: AskContactAgentPlace) => {
      seedAskAgentDraft(agent, place.channelId);
      void goChannel(place.channelId);
    },
    [goChannel],
  );

  return { resolution, ask };
}

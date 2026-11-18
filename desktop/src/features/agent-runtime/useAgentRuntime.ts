import { useQuery } from "@tanstack/react-query";
import { relayClient } from "@/shared/api/relayClient";
import { useRelayOrigin } from "@/shared/lib/useRelayOrigin";
import { useFocusedRefetchInterval } from "@/shared/lib/useDocumentVisible";
import {
  AGENT_RUNTIME_KIND,
  AGENT_RUNTIME_D_TAG,
  selectRuntimeCard,
} from "./model";
import { useRuntimeCardsEnabled } from "./preference";

/** Bounded author-scoped polling; community-keyed cache never crosses relay scopes. */
export function useAgentRuntime(pubkey: string | undefined) {
  const enabled = useRuntimeCardsEnabled();
  const origin = useRelayOrigin();
  const refetchInterval = useFocusedRefetchInterval(60_000);
  const query = useQuery({
    queryKey: ["agent-runtime", origin, pubkey],
    enabled: enabled && Boolean(origin && pubkey),
    queryFn: async () => {
      if (!pubkey) throw new Error("Missing agent key");
      return selectRuntimeCard(
        await relayClient.fetchEvents({
          kinds: [AGENT_RUNTIME_KIND],
          authors: [pubkey],
          "#d": [AGENT_RUNTIME_D_TAG],
          limit: 1,
        }),
        pubkey,
      );
    },
    staleTime: 60_000,
    refetchInterval,
    retry: 1,
  });
  return {
    ...query,
    data: enabled && origin && pubkey ? query.data : undefined,
  };
}

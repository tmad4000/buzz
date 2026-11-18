import { useSyncExternalStore } from "react";
import { useIdentityQuery } from "@/shared/api/hooks";
import { relayClient } from "@/shared/api/relayClient";
import { invokeTauri } from "@/shared/api/tauri";
import { useRelayOrigin } from "@/shared/lib/useRelayOrigin";
import {
  QUEUE_BRIDGE,
  QUEUE_RECIPIENT,
  QUEUE_RELAY,
  queueFilter,
} from "./model";
import { createQueueReader, type QueueView } from "./reader";
import { useQueueEnabled } from "./preference";
const reader = createQueueReader({
  now: () => Math.floor(Date.now() / 1000),
  subscribe: (event, ready, signal) =>
    relayClient.subscribeLive(queueFilter(), event, ready, 5000, signal),
  decrypt: (event) =>
    invokeTauri<unknown>("decrypt_agent_queue_event", {
      eventJson: JSON.stringify(event),
      expectedRelayOrigin: QUEUE_RELAY,
      expectedRecipient: QUEUE_RECIPIENT,
    }),
});
const disabled: QueueView = { status: "loading" };
const noop = () => () => {};
const empty = () => disabled;
export function useAgentQueue(pubkey?: string) {
  const enabled = useQueueEnabled();
  const origin = useRelayOrigin();
  const { data: identity } = useIdentityQuery();
  const allowed =
    pubkey === QUEUE_BRIDGE &&
    origin === QUEUE_RELAY &&
    identity?.pubkey === QUEUE_RECIPIENT &&
    !identity.lost &&
    !identity.locked &&
    !identity.resetFailed;
  const active = allowed && enabled;
  const view = useSyncExternalStore(
    active ? reader.subscribe : noop,
    active ? reader.getSnapshot : empty,
    empty,
  );
  return { allowed, enabled, view: active ? view : disabled };
}

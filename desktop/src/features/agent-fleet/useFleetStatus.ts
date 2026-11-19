import { useSyncExternalStore } from "react";
import { useIdentityQuery } from "@/shared/api/hooks";
import { relayClient } from "@/shared/api/relayClient";
import { invokeTauri } from "@/shared/api/tauri";
import { useRelayOrigin } from "@/shared/lib/useRelayOrigin";
import { FLEET_RELAY, FLEET_RECIPIENT, fleetFilter } from "./model";
import { createFleetReader, type FleetView } from "./reader";
import { useFleetEnabled } from "./preference";
const reader = createFleetReader({
  now: () => Math.floor(Date.now() / 1000),
  subscribe: (event, ready, signal) =>
    relayClient.subscribeLive(fleetFilter(), event, ready, 5000, signal),
  decrypt: (event) =>
    invokeTauri<unknown>("decrypt_agent_fleet_event", {
      eventJson: JSON.stringify(event),
      expectedRelayOrigin: FLEET_RELAY,
      expectedRecipient: FLEET_RECIPIENT,
    }),
});
const emptyView: FleetView = { status: "loading" };
const empty = () => emptyView,
  noop = () => () => {};
export function useFleetStatus() {
  const enabled = useFleetEnabled(),
    origin = useRelayOrigin();
  const { data: identity } = useIdentityQuery();
  const allowed =
    origin === FLEET_RELAY &&
    identity?.pubkey === FLEET_RECIPIENT &&
    !identity.lost &&
    !identity.locked &&
    !identity.resetFailed;
  const active = allowed && enabled;
  const view = useSyncExternalStore(
    active ? reader.subscribe : noop,
    active ? reader.getSnapshot : empty,
    empty,
  );
  return { allowed, enabled, view: active ? view : emptyView };
}

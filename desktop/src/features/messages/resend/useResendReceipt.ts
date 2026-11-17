import * as React from "react";
import { relayClient } from "@/shared/api/relayClient";
import { loadActiveCommunityId } from "@/features/communities/communityStorage";
import { isPaseoAcknowledgement, PASEO_PUBKEY, receiptKey } from "./protocol";
import {
  getResendReceipt,
  setResendReceipt,
  subscribeResendReceipt,
} from "./receiptStore";
import type { RelayEvent } from "@/shared/api/types";
export function useResendReceipt(
  channel: string | null | undefined,
  actor: string | undefined,
  original: string,
  edit: string | undefined,
) {
  const community = loadActiveCommunityId();
  const key = receiptKey(
    community,
    actor ?? "",
    channel ?? "",
    original,
    edit ?? "",
  );
  const subscribe = React.useCallback(
    (notify: () => void) => subscribeResendReceipt(key, notify),
    [key],
  );
  const get = React.useCallback(() => getResendReceipt(key), [key]);
  const receipt = React.useSyncExternalStore(subscribe, get, get);
  React.useEffect(() => {
    if (!receipt || receipt.phase === "sent" || !channel) return;
    const triggerId = receipt.event.id;
    let disposed = false;
    let stop: (() => void) | undefined;
    const controller = new AbortController();
    const accept = (event: RelayEvent) => {
      if (
        disposed ||
        loadActiveCommunityId() !== community ||
        !isPaseoAcknowledgement(event, channel, triggerId)
      )
        return;
      const live = getResendReceipt(key);
      if (live?.event.id === triggerId && live.phase !== "sent")
        setResendReceipt(key, { event: live.event, phase: "sent" });
    };
    const filter = {
      kinds: [7],
      authors: [PASEO_PUBKEY],
      "#e": [triggerId],
      limit: 20,
    };
    void relayClient
      .subscribeLive(filter, accept, undefined, undefined, controller.signal)
      .then((unsubscribe) => {
        if (disposed) unsubscribe();
        else stop = unsubscribe;
      })
      .catch(() => {});
    void relayClient
      .fetchEvents(filter)
      .then((events) => events.forEach(accept))
      .catch(() => {});
    return () => {
      disposed = true;
      controller.abort();
      stop?.();
    };
  }, [key, community, channel, receipt]);
  return receipt;
}

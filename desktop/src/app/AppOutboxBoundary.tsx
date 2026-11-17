import type { ReactNode } from "react";
import { PreventSleepProvider } from "@/features/agents/usePreventSleep";
import { OutboxProvider } from "@/features/messages/outbox/OutboxProvider";

/** Keep durable sending independent of route and composer lifetimes. */
export function AppOutboxBoundary({
  children,
  relayUrl,
  signerPubkey,
}: {
  children: ReactNode;
  relayUrl?: string;
  signerPubkey?: string;
}) {
  return (
    <OutboxProvider relayUrl={relayUrl} signerPubkey={signerPubkey}>
      <PreventSleepProvider>{children}</PreventSleepProvider>
    </OutboxProvider>
  );
}

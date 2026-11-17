import type { ReactNode } from "react";
import { PreventSleepProvider } from "@/features/agents/usePreventSleep";
import { PaseoHostProvider } from "@/features/presence/ui/PaseoHostProvider";
export function AppHostHealthFrame({
  pubkey,
  relayUrl,
  children,
}: {
  pubkey?: string;
  relayUrl?: string;
  children: ReactNode;
}) {
  return (
    <PaseoHostProvider pubkey={pubkey} relayUrl={relayUrl}>
      <PreventSleepProvider>{children}</PreventSleepProvider>
    </PaseoHostProvider>
  );
}

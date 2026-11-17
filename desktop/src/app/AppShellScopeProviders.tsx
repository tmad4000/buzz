import type * as React from "react";
import { PreventSleepProvider } from "@/features/agents/usePreventSleep";
import { ArchiveProvider } from "@/features/messages/archive/ArchiveProvider";

/** One owner for account/relay-scoped personal state across channel views. */
export function AppShellScopeProviders({
  children,
  ...scope
}: React.ComponentProps<typeof ArchiveProvider>) {
  return (
    <ArchiveProvider {...scope}>
      <PreventSleepProvider>{children}</PreventSleepProvider>
    </ArchiveProvider>
  );
}

import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";

import {
  loadActiveCommunityId,
  loadCommunities,
} from "@/features/communities/communityStorage";
import { useCommunityOnboarding } from "@/features/onboarding/communityOnboarding";
import { getJoinPolicy } from "@/shared/api/invites";
import { invokeTauri } from "@/shared/api/tauri";
import { discoverAcpRuntimes } from "@/shared/api/tauriAcpDiscovery";
import {
  getGlobalAgentConfig,
  setGlobalAgentConfig,
} from "@/shared/api/tauriGlobalAgentConfig";
import { getIdentity } from "@/shared/api/tauriIdentity";

type SetupRequest = { relayUrl: string; pubkey: string; checkOnly: boolean };

type SetupStatus =
  | "invalid_input"
  | "identity_unavailable"
  | "different_community"
  | "setup_in_progress"
  | "subscription_required"
  | "consent_required"
  | "relay_access_required"
  | "ready_to_connect"
  | "already_configured"
  | "connecting"
  | "connected"
  | "profile_required"
  | "failed";

export async function reportProgrammaticSetup(status: SetupStatus) {
  await invokeTauri("report_setup_status", { status });
}

export function useProgrammaticSetup(
  enabled: boolean,
  complete: (pubkey: string) => void,
) {
  const { start, transaction } = useCommunityOnboarding();
  const finished = useRef(false);

  useEffect(() => {
    if (!enabled || !isTauri() || finished.current) return;
    let cancelled = false;

    function report(status: SetupStatus) {
      if (cancelled) return;
      finished.current = true;
      return reportProgrammaticSetup(status);
    }

    async function run() {
      let request: SetupRequest | null;
      try {
        request = await invokeTauri<SetupRequest | null>("get_setup_request");
      } catch {
        return report("invalid_input");
      }
      if (!request || cancelled) return;

      const identity = await getIdentity();
      if (cancelled) return;
      if (
        identity.lost ||
        identity.locked ||
        identity.resetFailed ||
        identity.pubkey !== request.pubkey
      ) {
        return report("identity_unavailable");
      }
      if (transaction) return report("setup_in_progress");

      const communities = loadCommunities();
      const active = communities.find(
        (item) => item.id === loadActiveCommunityId(),
      );
      const alreadyConnected =
        active?.relayUrl.replace(/\/+$/, "") === request.relayUrl &&
        active.pubkey === request.pubkey;
      if (communities.length && !alreadyConnected) {
        return report("different_community");
      }

      const [config, hasSubscription, runtimes] = await Promise.all([
        getGlobalAgentConfig(),
        invokeTauri<boolean>("has_claude_subscription"),
        discoverAcpRuntimes({ force: true }),
      ]);
      if (cancelled) return;
      const claude = runtimes.find((runtime) => runtime.id === "claude");
      if (
        !hasSubscription ||
        claude?.availability !== "available" ||
        claude.authStatus.status !== "logged_in" ||
        Object.entries(config.env_vars).some(
          ([name, value]) =>
            Boolean(value) &&
            (name.startsWith("ANTHROPIC_") ||
              name === "CLAUDE_CODE_OAUTH_TOKEN"),
        )
      ) {
        return report("subscription_required");
      }

      if (!alreadyConnected) {
        const policy = await getJoinPolicy(request.relayUrl, "native");
        if (cancelled) return;
        if (
          policy &&
          (policy.ageAttestationRequired ||
            policy.termsMarkdown ||
            policy.privacyMarkdown)
        ) {
          return report("consent_required");
        }
      }

      try {
        await invokeTauri("check_setup_relay_access");
      } catch {
        if (!cancelled) return report("relay_access_required");
        return;
      }
      if (cancelled) return;
      if (request.checkOnly) {
        return report(
          alreadyConnected && config.preferred_runtime === "claude"
            ? "already_configured"
            : "ready_to_connect",
        );
      }
      const currentIdentity = await getIdentity();
      if (cancelled) return;
      if (
        currentIdentity.pubkey !== request.pubkey ||
        currentIdentity.lost ||
        currentIdentity.locked ||
        currentIdentity.resetFailed
      ) {
        return report("identity_unavailable");
      }
      if (config.preferred_runtime !== "claude") {
        await setGlobalAgentConfig({ ...config, preferred_runtime: "claude" });
      }
      if (cancelled) return;
      if (alreadyConnected) {
        complete(request.pubkey);
        return report("already_configured");
      }
      if (
        !start({
          source: "programmatic-setup",
          firstCommunityPage: "member",
          relayUrl: request.relayUrl,
        })
      ) {
        return report("setup_in_progress");
      }
      complete(request.pubkey);
      return report("connecting");
    }

    void run().catch(() => {
      if (!cancelled) void report("failed");
    });
    return () => {
      cancelled = true;
    };
  }, [complete, enabled, start, transaction]);
}

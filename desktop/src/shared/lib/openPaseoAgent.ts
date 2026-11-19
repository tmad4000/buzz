import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { copyTextToClipboard } from "./clipboard";
import { paseoAgentTarget } from "./paseoAgentTarget";
/** Fork owns paseo-fork; paseo is a separate stock app on Jacob's Mac. Preserve signed URLs, normalize only the explicit native action. */
export async function openPaseoAgent(href: string): Promise<void> {
  const target = paseoAgentTarget(href);
  if (!target) {
    toast.error("Invalid Paseo agent link");
    return;
  }
  try {
    if (!target.nativeUrl) throw new Error("Host not configured");
    await openUrl(target.nativeUrl);
  } catch {
    // No invented web origin or automatic retry into another application.
    toast.error("Could not open Paseo Fork", {
      description: `Agent ${target.agentId} · server ${target.serverId}. Copy the ID and open it in Paseo Fork.`,
      duration: 12000,
      action: {
        label: "Copy agent ID",
        onClick: () => {
          void copyTextToClipboard(target.agentId, "Agent ID copied");
        },
      },
    });
  }
}

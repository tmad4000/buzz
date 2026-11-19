import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useKnownAgentPubkeys } from "@/features/agents/useKnownAgentPubkeys";
import { useProfilePanel } from "@/shared/context/ProfilePanelContext";
import { copyTextToClipboard } from "@/shared/lib/clipboard";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/shared/ui/context-menu";
import type { Channel } from "@/shared/api/types";
import { deferMenuAction } from "@/features/sidebar/ui/sidebarMenuHelpers";
import { runtimeSessionLink } from "./model";
import { useAgentRuntime } from "./useAgentRuntime";

/** Runtime actions only for a single known agent among this DM's participants. */
export function AgentRuntimeMenu({ channel }: { channel: Channel }) {
  const known = useKnownAgentPubkeys();
  const agents =
    channel.channelType === "dm"
      ? channel.participantPubkeys.filter((pk) => known.has(pk))
      : [];
  const pubkey = agents.length === 1 ? agents[0] : undefined;
  const { data } = useAgentRuntime(pubkey);
  const { openProfilePanel } = useProfilePanel();
  if (!data || !pubkey) return null;
  const link = data.card.session && runtimeSessionLink(data.card.session);
  const commands = data.card.resume
    ?.map((r) => `${r.label}\n${r.command}`)
    .join("\n\n");
  return (
    <>
      <ContextMenuSeparator />
      {link ? (
        <ContextMenuItem
          onSelect={() =>
            deferMenuAction(() => {
              void openUrl(link).catch(() =>
                toast.error("Failed to open Paseo"),
              );
            })
          }
        >
          Open in Paseo ↗
        </ContextMenuItem>
      ) : null}
      {commands ? (
        <ContextMenuItem
          onSelect={() =>
            copyTextToClipboard(commands, "Resume instructions copied")
          }
        >
          Copy resume command
        </ContextMenuItem>
      ) : null}
      {openProfilePanel ? (
        <ContextMenuItem
          onSelect={() => deferMenuAction(() => openProfilePanel(pubkey))}
        >
          Runtime details
        </ContextMenuItem>
      ) : null}
    </>
  );
}

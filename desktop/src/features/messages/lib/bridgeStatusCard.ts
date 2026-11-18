import { isPaseoAgentLink } from "@/shared/ui/markdown/paseoAgentLink";
import type { TimelineMessage } from "@/features/messages/types";

// Compatibility contract: listener/status_agent_metadata.py render(), signed by
// the established bridge identity. This is a report, never a runtime lease or
// authority to resolve a thread. Unknown formats retain their original body.
const BRIDGE_SIGNER =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IDENTITY = new RegExp(
  `^Agent \x60(${UUID})\x60 · server \x60(srv_[A-Za-z0-9_-]{6,128})\x60$`,
);
const LABELS: Readonly<Record<string, string>> = {
  "👀 Seen": "👀 Reported seen",
  "⏳ Working": "⏳ Reported working",
  "❓ Needs Jacob": "❓ Needs Jacob",
  "✅ Done": "✅ Reported done",
  "👍 Noted · no action": "👍 Noted · no action",
  "⚠️ Agent response overdue": "⚠️ Agent response overdue",
};

/** Recognize only the bridge's exact legacy card envelope; answers stay content. */
export function parseBridgeStatusCard(message: TimelineMessage) {
  if (
    message.body.length > 2048 ||
    message.kind !== 9 ||
    !message.parentId ||
    message.signerPubkey !== BRIDGE_SIGNER
  )
    return null;
  const lines = message.body.split("\n");
  if (lines.length !== 4 && lines.length !== 5) return null;
  const identity = IDENTITY.exec(lines[1]);
  if (!identity) return null;
  const [, agentId, serverId] = identity;
  const href = `paseo://h/${serverId}/agent/${agentId}`;
  if (!isPaseoAgentLink(href) || lines[2] !== `[Open agent](${href})`)
    return null;
  const source = /^Reported status · source: (root|listener|watchdog)$/.exec(
    lines[3],
  )?.[1];
  if (!source) return null;
  const header = /^(.*?) — (.+) · (.+) \((.+)\)$/.exec(lines[0]);
  if (!header || !LABELS[header[1]]) return null;
  if (
    (header[1] === "❓ Needs Jacob" ||
      header[1] === "✅ Done" ||
      header[1] === "👍 Noted · no action") &&
    source !== "root"
  )
    return null;
  if (header[1] === "⚠️ Agent response overdue" && source !== "watchdog")
    return null;
  if (
    lines[4] &&
    !/^Metadata unavailable; last verified at Unix \d+$/.test(lines[4])
  )
    return null;
  return {
    label: LABELS[header[1]],
    title: header[2],
    model: header[3],
    provider: header[4],
    agentId,
    serverId,
    href,
    source,
    metadataUnavailable: lines[4] ?? null,
  };
}

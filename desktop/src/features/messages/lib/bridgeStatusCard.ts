import { isPaseoAgentLink } from "@/shared/ui/markdown/paseoAgentLink";
import type { TimelineMessage } from "@/features/messages/types";

// Compatibility contract: listener/status_agent_metadata.py render(), signed by
// the established bridge identity. This is a report, never a runtime lease or
// authority to resolve a thread. Unknown formats retain their original body.
export const BRIDGE_STATUS_SIGNER =
  "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const IDENTITY = new RegExp(
  `^Agent \x60(${UUID})\x60 · server \x60(srv_[A-Za-z0-9_-]{6,128})\x60$`,
);
const LABELS: Readonly<Record<string, string>> = {
  "👀 Seen": "👀 Reported seen",
  "⏳ Working": "⏳ Reported working",
  "❓ Needs Jacob": "❓ Reported waiting",
  "✅ Done": "✅ Reported done",
  "👍 Noted · no action": "👍 Reported noted",
  "⚠️ Agent response overdue": "⚠️ Reported overdue",
};

/** Prefer signed machine tags; body parsing is only for untagged old cards. */
export function parseBridgeStatusCard(message: TimelineMessage) {
  if (
    message.kind !== 9 ||
    message.signerPubkey !== BRIDGE_STATUS_SIGNER ||
    (message.editSignerPubkey !== undefined &&
      message.editSignerPubkey !== BRIDGE_STATUS_SIGNER)
  )
    return null;
  if (message.tags?.some((tag) => tag[0] === "buzz-status"))
    return parseTaggedCard(message.tags);
  if (!message.parentId || message.body.length > 2048) return null;
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
  if (!header || !Object.hasOwn(LABELS, header[1])) return null;
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

const STATUS_TAG_NAMES = new Set([
  "buzz-status",
  "agent",
  "paseo-link",
  "buzz-status-source",
]);
const TAG_LABELS: Readonly<Record<string, string>> = {
  progress: "⏳ Reported working",
  waiting: "❓ Reported waiting",
  done: "✅ Reported done",
  ack: "👍 Reported noted",
};

function parseTaggedCard(tags: string[][]) {
  const one = (name: string) => {
    const matches = tags.filter((tag) => tag[0] === name);
    return matches.length === 1 ? matches[0] : null;
  };
  const status = one("buzz-status"),
    agent = one("agent"),
    link = one("paseo-link");
  const replies = tags.filter((tag) => tag[0] === "e" && tag[3] === "reply");
  const sourceTags = tags.filter((tag) => tag[0] === "buzz-status-source");
  if (
    !status ||
    status.length !== 2 ||
    !Object.hasOwn(TAG_LABELS, status[1]) ||
    !agent ||
    (agent.length !== 3 && agent.length !== 4) ||
    !new RegExp(`^${UUID}$`).test(agent[1]) ||
    !link ||
    link.length !== 2 ||
    replies.length !== 1 ||
    !/^[0-9a-f]{64}$/.test(replies[0][1]) ||
    sourceTags.length > 1
  )
    return null;
  const href = `paseo://h/${agent[2]}/agent/${agent[1]}`;
  if (!isPaseoAgentLink(href) || link[1] !== href) return null;
  const sourceTag = sourceTags[0];
  if (
    sourceTag &&
    (sourceTag.length !== 2 ||
      !["root", "listener", "watchdog"].includes(sourceTag[1]))
  )
    return null;
  const title = agent[3] ?? `Agent ${agent[1].slice(0, 8)}`;
  if (
    !title.trim() ||
    title.length > 160 ||
    Array.from(title).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return null;
  return {
    label: TAG_LABELS[status[1]],
    title,
    agentId: agent[1],
    serverId: agent[2],
    href,
    source: sourceTag?.[1] ?? "bridge",
    model: "Model unavailable",
    provider: "Provider unavailable",
    metadataUnavailable: null,
    requestId: replies[0][1],
  };
}

/** An authorized bridge edit replaces the entire status snapshot, never h/e tags. */
export function overlayBridgeStatusTags(
  originalTags: string[][],
  editTags: string[][] | undefined,
) {
  if (
    !editTags ||
    ![...originalTags, ...editTags].some((tag) => tag[0] === "buzz-status")
  )
    return originalTags;
  return [
    ...originalTags.filter((tag) => !STATUS_TAG_NAMES.has(tag[0])),
    ...editTags.filter((tag) => STATUS_TAG_NAMES.has(tag[0])),
  ];
}

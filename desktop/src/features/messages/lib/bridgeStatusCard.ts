import producerUnicode from "./bridgeProducerUnicodeC.json" with {
  type: "json",
};
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

// Producer label(): replace Unicode category C with spaces, trim, truncate by
// code points, then escape exactly this Markdown set. Validate its wire form;
// escaped bytes and UTF-16 code units are not the producer's length measure.
const PRODUCER_ESCAPES = new Set("\\`*_{}[]()<>#!|");
// JS/browser Unicode versions differ from the producer's Python database.
// Pin the producer's excluded categories rather than trusting host regex tables.
function producerExcludes(char: string): boolean {
  const codepoint = char.codePointAt(0)!;
  let low = 0,
    high = producerUnicode.ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const [start, end] = producerUnicode.ranges[middle];
    if (codepoint < start) high = middle - 1;
    else if (codepoint > end) low = middle + 1;
    else return true;
  }
  return false;
}
function decodeProducerLabel(encoded: string, maximum: number): string | null {
  const chars = Array.from(encoded);
  let decoded = "";
  for (let i = 0; i < chars.length; i++) {
    let char = chars[i];
    if (char === "\\") {
      char = chars[++i];
      if (!PRODUCER_ESCAPES.has(char)) return null;
    } else if (PRODUCER_ESCAPES.has(char)) return null;
    if (producerExcludes(char)) return null;
    decoded += char;
  }
  const length = Array.from(decoded).length;
  // Truncating an already-trimmed long label may leave trailing whitespace.
  if (
    length > maximum ||
    decoded.trimStart() !== decoded ||
    (length < maximum && decoded.trimEnd() !== decoded)
  )
    return null;
  return decoded;
}

/** Prefer signed machine tags; body parsing is only for untagged old cards. */
export function parseBridgeStatusCard(message: TimelineMessage) {
  if (
    message.kind !== 9 ||
    message.signerPubkey !== BRIDGE_STATUS_SIGNER ||
    (message.edited && message.editSignerPubkey === undefined) ||
    (message.editSignerPubkey !== undefined &&
      message.editSignerPubkey !== BRIDGE_STATUS_SIGNER)
  )
    return null;
  if (message.tags?.some((tag) => tag[0] === "buzz-status"))
    return parseTaggedCard(message.tags);
  if (message.body.length > 8192) return null;
  let body = message.body;
  // ProjectCards.render_text appends the same attribution envelope. Only its
  // exact bridge-owned Item prefix permits an unthreaded project card.
  const isProject =
    /^(?:Item: [^\n]+\n\n|(?:⏳ Working|❓ Waiting on Jacob|✅ Shipped|⚠️ Stale — no update for 2 hours)\nItem: [^\n]+\n\n)/.test(
      body,
    );
  if (isProject) body = body.slice(body.lastIndexOf("\n\n") + 2);
  if ((!message.parentId && !isProject) || body.length > 2048) return null;
  const lines = body.split("\n");
  if (lines.length < 4 || lines.length > 6) return null;
  const identity = IDENTITY.exec(lines[1]);
  if (!identity) return null;
  const [, agentId, serverId] = identity;
  const href = `paseo://h/${serverId}/agent/${agentId}`;
  if (!isPaseoAgentLink(href) || lines[2] !== `[Open agent](${href})`)
    return null;
  const source =
    /^Reported status · source: (root|listener|watchdog|jacob)$/.exec(
      lines[3],
    )?.[1];
  if (!source) return null;
  const header = /^([\s\S]*?) — ([\s\S]*) · ([\s\S]*) \(([\s\S]*)\)$/.exec(
    lines[0],
  );
  if (!header) return null;
  const control =
    /^(🛑 Stopped by Jacob|Already idle when Jacob asked to stop|Interruption acknowledged; new activity exists|Continuation queued by Jacob) at ((?:[01]\d|2[0-3]):[0-5]\d UTC)$/.exec(
      header[1],
    );
  const controlStates: Readonly<Record<string, string>> = {
    "🛑 Stopped by Jacob": "stopped",
    "Already idle when Jacob asked to stop": "idle",
    "Interruption acknowledged; new activity exists": "interrupted",
    "Continuation queued by Jacob": "continuation",
  };
  if (Boolean(control) !== (source === "jacob")) return null;
  if (!control && !Object.hasOwn(LABELS, header[1])) return null;
  const decoded = [160, 80, 40].map((limit, index) =>
    decodeProducerLabel(header[index + 2], limit),
  );
  if (decoded.some((label) => label === null)) return null;
  if (
    (header[1] === "❓ Needs Jacob" ||
      header[1] === "✅ Done" ||
      header[1] === "👍 Noted · no action") &&
    source !== "root"
  )
    return null;
  if (header[1] === "⚠️ Agent response overdue" && source !== "watchdog")
    return null;
  const extras = lines.slice(4);
  const metadataLines = extras.filter((line) =>
    /^Metadata unavailable; last verified at Unix \d+$/.test(line),
  );
  const unavailable =
    "Continuation unavailable: the interrupted instruction was not verified.";
  if (
    metadataLines.length > 1 ||
    extras.filter((line) => line === unavailable).length > 1 ||
    extras.some(
      (line) => line !== unavailable && !metadataLines.includes(line),
    ) ||
    (extras.includes(unavailable) && control?.[1] !== "🛑 Stopped by Jacob")
  )
    return null;
  const states: Readonly<Record<string, string>> = {
    "👀 Seen": "seen",
    "⏳ Working": "progress",
    "❓ Needs Jacob": "waiting",
    "✅ Done": "done",
    "👍 Noted · no action": "ack",
    "⚠️ Agent response overdue": "overdue",
  };
  const state = control ? controlStates[control[1]] : states[header[1]];
  return {
    label: control ? header[1] : LABELS[header[1]],
    state,
    resumeAvailable: state === "stopped" && !extras.includes(unavailable),
    title: decoded[0]!,
    model: decoded[1]!,
    provider: decoded[2]!,
    agentId,
    serverId,
    href,
    source,
    metadataUnavailable: metadataLines[0] ?? null,
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
  // Prospective classification only: obligations/completion reports require Root.
  if (
    ["waiting", "done", "ack"].includes(status[1]) &&
    sourceTag?.[1] !== "root"
  )
    return null;
  const title = agent[3] ?? `Agent ${agent[1].slice(0, 8)}`;
  if (
    !title.trim() ||
    Array.from(title).length > 160 ||
    Array.from(title).some(producerExcludes)
  )
    return null;
  return {
    label: TAG_LABELS[status[1]],
    state: status[1],
    resumeAvailable: false,
    title,
    agentId: agent[1],
    serverId: agent[2],
    href,
    source: sourceTag?.[1] ?? "bridge",
    model: "Model unavailable",
    provider: "Provider unavailable",
    metadataUnavailable: null,
    originEventId: replies[0][1],
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

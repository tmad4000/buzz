import { verifyEvent } from "nostr-tools/pure";

import {
  HOST_SERVERS,
  runtimeSessionLink,
} from "@/features/agent-runtime/model";
import {
  BRIDGE_STATUS_SIGNER,
  parseBridgeStatusCard,
} from "@/features/messages/lib/bridgeStatusCard";
import { formatTimelineMessages } from "@/features/messages/lib/formatTimelineMessages";
import {
  getChannelIdFromTags,
  getThreadReference,
} from "@/features/messages/lib/threading";
import type { Channel, RelayEvent } from "@/shared/api/types";
import {
  KIND_DELETION,
  KIND_NIP29_DELETE_EVENT,
  KIND_STREAM_MESSAGE,
  KIND_STREAM_MESSAGE_EDIT,
} from "@/shared/constants/kinds";

const ROOT_AGENT_ID = "d3caa262-cdcd-454d-9d42-0cd05ac69156";
const HOST_LABELS: Readonly<Record<string, string>> = {
  [HOST_SERVERS.gcp]: "GCP",
  [HOST_SERVERS.m4]: "M4",
  [HOST_SERVERS.m5]: "M5",
};
const REPORT_STATES = {
  "❓ Reported waiting": "waiting",
  "⏳ Reported working": "working",
  "👀 Reported seen": "seen",
  "⚠️ Reported overdue": "stale",
  "✅ Reported done": "done",
  "👍 Reported noted": "noted",
} as const;
type ReportState = (typeof REPORT_STATES)[keyof typeof REPORT_STATES];
const PRIORITY: Record<ReportState, number> = {
  waiting: 0,
  working: 1,
  seen: 2,
  stale: 3,
  done: 4,
  noted: 5,
};
const HOUR = 3600;
const DAY = 24 * HOUR;
const EVENT_ID = /^[0-9a-f]{64}$/;

export type SideAgent = {
  agentId: string;
  title: string;
  channelId: string;
  channelType: Channel["channelType"];
  channelName: string;
  threadTitle?: string;
  rootId: string;
  cardId: string;
  revisionId: string;
  reportedAt: number;
  source: string;
  state: ReportState;
  host?: string;
  paseoLink: string | null;
};

export type SideAgentSource = {
  channel: Channel;
  windows: RelayEvent[][];
};

/** Use the authenticated timeline projection so edits keep their original binding. */
export function foldSideAgents(sources: SideAgentSource[]): SideAgent[] {
  const latest = new Map<string, SideAgent>();
  for (const { channel, windows } of sources) {
    if (!channel.isMember || channel.archivedAt) continue;
    const reports = new Map<string, RelayEvent>();
    const messages = new Map<string, RelayEvent>();
    const roots = new Set<string>();
    for (const window of windows) {
      for (const event of window) {
        messages.set(event.id, event);
        if (
          event.kind === KIND_DELETION ||
          event.kind === KIND_NIP29_DELETE_EVENT
        ) {
          reports.set(event.id, event);
        } else if (
          (event.kind === KIND_STREAM_MESSAGE ||
            event.kind === KIND_STREAM_MESSAGE_EDIT) &&
          event.pubkey === BRIDGE_STATUS_SIGNER &&
          getChannelIdFromTags(event.tags) === channel.id &&
          !event.pending &&
          verifyEvent(event)
        ) {
          reports.set(event.id, event);
          if (event.kind === KIND_STREAM_MESSAGE) {
            const { rootId } = getThreadReference(event.tags);
            if (rootId) roots.add(rootId);
          }
        }
      }
    }
    if (!roots.size) continue;
    // Project loaded thread titles through the same edit and deletion rules.
    for (const event of messages.values()) {
      if (event.pubkey === BRIDGE_STATUS_SIGNER) continue;
      if (
        roots.has(event.id) ||
        (event.kind === KIND_STREAM_MESSAGE_EDIT &&
          event.tags.some(([type, id]) => type === "e" && roots.has(id)))
      )
        reports.set(event.id, event);
    }
    const projected = formatTimelineMessages(
      [...reports.values()],
      channel,
      undefined,
      null,
    );
    const visibleById = new Map(
      projected.map((message) => [message.id, message]),
    );
    for (const message of projected) {
      const card = parseBridgeStatusCard(message);
      if (
        !card ||
        card.agentId === ROOT_AGENT_ID ||
        !message.rootId ||
        !EVENT_ID.test(message.rootId)
      )
        continue;
      const state = REPORT_STATES[card.label as keyof typeof REPORT_STATES];
      if (!state) continue;
      const reportedAt = message.editRevision?.createdAt ?? message.createdAt;
      const revisionId = message.editRevision?.id ?? message.id;
      const previous = latest.get(card.agentId);
      if (
        previous &&
        (previous.reportedAt > reportedAt ||
          (previous.reportedAt === reportedAt &&
            previous.revisionId <= revisionId))
      )
        continue;
      latest.set(card.agentId, {
        agentId: card.agentId,
        title: card.title || `Agent ${card.agentId.slice(0, 8)}`,
        channelId: channel.id,
        channelType: channel.channelType,
        channelName: channel.name,
        threadTitle: visibleById
          .get(message.rootId)
          ?.body.trim()
          .split("\n", 1)[0]
          ?.slice(0, 160),
        rootId: message.rootId,
        cardId: message.id,
        revisionId,
        reportedAt,
        source: card.source,
        state,
        host: HOST_LABELS[card.serverId],
        paseoLink: runtimeSessionLink({
          serverId: card.serverId,
          agentId: card.agentId,
        }),
      });
    }
  }
  return [...latest.values()];
}

/** Prefer current reports and expose older completions on demand. */
export function presentSideAgents(
  reports: SideAgent[],
  now: number,
  showOlder: boolean,
) {
  const visible: SideAgent[] = [];
  let hasOlder = false;
  for (const report of reports) {
    const age = now - report.reportedAt;
    if ((report.state === "done" || report.state === "noted") && age > DAY) {
      if (age > 7 * DAY) continue;
      hasOlder = true;
      if (!showOlder) continue;
    }
    visible.push(
      report.state === "working" && age >= 2 * HOUR
        ? { ...report, state: "stale" }
        : report,
    );
  }
  visible.sort(
    (a, b) =>
      PRIORITY[a.state] - PRIORITY[b.state] ||
      b.reportedAt - a.reportedAt ||
      a.agentId.localeCompare(b.agentId),
  );
  return { visible, hasOlder };
}

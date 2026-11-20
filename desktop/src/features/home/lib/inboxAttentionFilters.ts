import type { InboxItem } from "@/features/home/lib/inbox";
import { buildInboxListRows } from "@/features/home/lib/inboxListRows";
import {
  type InboxStatusCard,
  latestInboxStatus,
} from "@/features/home/lib/inboxStatusCards";
import { isThreadReply } from "@/features/messages/lib/threading";
import type { Reminder } from "@/features/reminders/lib/reminderTypes";
import { KIND_JOB_RESULT } from "@/shared/constants/kinds";

export function isInboxAttentionFilter(filter: string) {
  return filter === "needs_you" || filter === "answers";
}

export function buildInboxAttentionFilters({
  items,
  dueReminders,
  snapshots,
  effectiveDoneSet,
  unreadOnly,
  selectedConversationId,
  getMessageReadAt,
  getChannelReadAt,
}: {
  items: readonly InboxItem[];
  dueReminders: readonly Reminder[];
  snapshots?: ReadonlyMap<string, InboxStatusCard>;
  effectiveDoneSet: ReadonlySet<string>;
  unreadOnly: boolean;
  selectedConversationId: string | null;
  getMessageReadAt: (id: string) => number | null;
  getChannelReadAt: (id: string) => number | null;
}) {
  const waiting = new Map<string, InboxStatusCard>();
  const done = new Map<string, InboxStatusCard>();
  const needs_you: InboxItem[] = [];
  const answers: InboxItem[] = [];
  const dueTargets = new Set(
    dueReminders.map((reminder) => reminder.content.target?.eventId),
  );

  for (const item of items) {
    const isRead = effectiveDoneSet.has(item.id);
    const unreadStatus = (card: InboxStatusCard) => {
      const readAt = getMessageReadAt(card.revisionId);
      return readAt === null
        ? card.revisionId !== card.eventId || !isRead
        : readAt < card.revisionAt;
    };
    const waitingCard =
      snapshots && latestInboxStatus(item, snapshots, "waiting");
    const doneCard =
      snapshots && latestInboxStatus(item, snapshots, "done", unreadStatus);
    const due = item.groupItems.some((event) => dueTargets.has(event.id));
    const unreadJob = item.groupItems.some(
      (event) =>
        event.kind === KIND_JOB_RESULT &&
        (event.channelId
          ? ((isThreadReply(event.tags)
              ? getMessageReadAt(event.id)
              : getChannelReadAt(event.channelId)) ?? -1) < event.createdAt
          : !isRead),
    );

    if (
      (waitingCard ||
        due ||
        item.categories.includes("needs_action") ||
        (!isRead && item.categories.includes("mention"))) &&
      (!unreadOnly ||
        !isRead ||
        due ||
        waitingCard ||
        item.conversationId === selectedConversationId)
    ) {
      needs_you.push(item);
      if (waitingCard) waiting.set(item.conversationId, waitingCard);
    }

    if (doneCard || unreadJob) {
      answers.push(item);
      if (doneCard) done.set(item.conversationId, doneCard);
    }
  }

  return {
    rowsByFilter: { needs_you, answers },
    statusByFilter: { needs_you: waiting, answers: done },
    needsYouCount: buildInboxListRows({
      items: needs_you,
      reminders: dueReminders,
    }).length,
  };
}

export function formatInboxAttentionCount(
  count: number,
  capped: boolean,
  coverage: "confirmed" | "syncing" | "unavailable",
) {
  return `${count}${capped ? "+" : ""}${coverage === "syncing" ? "…" : coverage === "unavailable" ? "?" : ""}`;
}

import {
  formatInboxFullTimestamp,
  type InboxContextMessage,
  type InboxFilter,
  type InboxItem,
} from "@/features/home/lib/inbox";
import { isProjectInboxItem } from "@/features/home/lib/projectInbox";
import {
  getChannelIdFromTags,
  getThreadReference,
  isBroadcastReply,
} from "@/features/messages/lib/threading";
import type { TimelineMessage } from "@/features/messages/types";
import type {
  FeedItem,
  HomeFeed,
  RelayEvent,
  UserProfileSummary,
} from "@/shared/api/types";
import { KIND_REMINDER } from "@/shared/constants/kinds";
import { normalizePubkey } from "@/shared/lib/pubkey";
import { resolveMentionProps } from "@/shared/lib/resolveMentionNames";

function hasThreadReplyTags(tags: string[][]) {
  const thread = getThreadReference(tags);
  return thread.parentId !== null && !isBroadcastReply(tags);
}

export function filterInboxItems(items: InboxItem[]) {
  return items.filter((item) => item.item.kind !== KIND_REMINDER);
}

export function hasInboxThreadContext(
  item: Pick<InboxItem, "groupItems" | "item">,
  contextMessages: readonly Pick<InboxContextMessage, "tags">[] = [],
) {
  return [item.item, ...item.groupItems, ...contextMessages].some((event) =>
    hasThreadReplyTags(event.tags ?? []),
  );
}

export function matchesInboxFilter(
  item: {
    categories: readonly string[];
    groupItems?: readonly FeedItem[];
    item?: FeedItem;
  },
  filter: InboxFilter,
  ownedAgentPubkeys?: ReadonlySet<string>,
) {
  if (filter === "all") {
    return ownedAgentPubkeys
      ? matchesInboxAllView(item, ownedAgentPubkeys)
      : true;
  }

  if (filter === "thread") {
    return [item.item, ...(item.groupItems ?? [])].some((groupItem) =>
      groupItem ? hasThreadReplyTags(groupItem.tags) : false,
    );
  }

  if (filter === "project") {
    return [item.item, ...(item.groupItems ?? [])].some(
      (groupItem) => groupItem && isProjectInboxItem(groupItem),
    );
  }

  if (filter === "agent_activity" && ownedAgentPubkeys) {
    const representative = item.item ?? item.groupItems?.at(-1);
    return representative
      ? ownedAgentPubkeys.has(normalizePubkey(representative.pubkey))
      : false;
  }

  return item.categories.includes(filter);
}

export function matchesInboxAllView(
  item: {
    categories: readonly string[];
    groupItems?: readonly FeedItem[];
    item?: FeedItem;
  },
  ownedAgentPubkeys: ReadonlySet<string>,
): boolean {
  const representative = item.item ?? item.groupItems?.at(-1);
  return (
    representative?.channelType === "dm" ||
    item.categories.includes("mention") ||
    [item.item, ...(item.groupItems ?? [])].some((groupItem) =>
      groupItem ? hasThreadReplyTags(groupItem.tags) : false,
    ) ||
    [item.item, ...(item.groupItems ?? [])].some(
      (groupItem) => groupItem && isProjectInboxItem(groupItem),
    ) ||
    item.categories.includes("needs_action") ||
    Boolean(
      representative &&
        ownedAgentPubkeys.has(normalizePubkey(representative.pubkey)),
    )
  );
}

const INBOX_FEED_FILTER_BUCKETS = {
  all: null,
  project: null,
  mention: "mentions",
  thread: null,
  needs_action: "needsAction",
  agent_activity: null,
} as const satisfies Record<
  Exclude<InboxFilter, "reminders" | "drafts">,
  keyof HomeFeed | null
>;

/** Loaded conversation counts, with "+" when the source may have more rows. */
export type InboxFilterCounts = Partial<Record<InboxFilter, string>>;

/** Use the same rows for the menu counts and for opening each filter. */
export function buildInboxFilterResults({
  items,
  feed,
  limit,
  ownedAgentPubkeys,
  unreadOnly,
  effectiveDoneSet,
  selectedConversationId,
}: {
  items: readonly InboxItem[];
  feed: HomeFeed | undefined;
  limit: number;
  ownedAgentPubkeys: ReadonlySet<string>;
  unreadOnly: boolean;
  effectiveDoneSet: ReadonlySet<string>;
  selectedConversationId: string | null;
}) {
  const visibleItems = unreadOnly
    ? items.filter(
        (item) =>
          !effectiveDoneSet.has(item.id) ||
          item.conversationId === selectedConversationId,
      )
    : items;
  const anyBucketFull = Object.values(feed ?? {}).some(
    (bucket) => bucket.length >= limit,
  );
  const rowsByFilter: Partial<Record<InboxFilter, InboxItem[]>> = {};
  const countsByFilter: InboxFilterCounts = {};

  for (const filter of Object.keys(INBOX_FEED_FILTER_BUCKETS) as Array<
    keyof typeof INBOX_FEED_FILTER_BUCKETS
  >) {
    const rows = visibleItems.filter((item) =>
      matchesInboxFilter(item, filter, ownedAgentPubkeys),
    );
    const bucket = INBOX_FEED_FILTER_BUCKETS[filter];
    const bucketFull = bucket
      ? (feed?.[bucket].length ?? 0) >= limit
      : anyBucketFull;
    rowsByFilter[filter] = rows;
    countsByFilter[filter] = `${rows.length}${bucketFull ? "+" : ""}`;
  }

  return { rowsByFilter, countsByFilter };
}

export function getContextMessageDepth(
  event: RelayEvent,
  eventById: ReadonlyMap<string, RelayEvent>,
): number {
  let depth = 0;
  let parentId = getThreadReference(event.tags).parentId;
  const seen = new Set<string>([event.id]);

  while (parentId && eventById.has(parentId) && !seen.has(parentId)) {
    depth += 1;
    seen.add(parentId);
    parentId = getThreadReference(eventById.get(parentId)?.tags ?? []).parentId;
  }

  return depth;
}

export function isInboxThreadContextEvent(
  event: RelayEvent,
  selection: {
    selectedChannelId: string | null;
    selectedEventId: string;
    selectedParentId: string | null;
    selectedThreadRootId: string | null;
  },
): boolean {
  if (
    selection.selectedChannelId &&
    getChannelIdFromTags(event.tags) !== selection.selectedChannelId
  ) {
    return false;
  }

  if (event.id === selection.selectedEventId) {
    return true;
  }

  if (
    selection.selectedThreadRootId &&
    event.id === selection.selectedThreadRootId
  ) {
    return true;
  }

  if (selection.selectedParentId && event.id === selection.selectedParentId) {
    return true;
  }

  const thread = getThreadReference(event.tags);
  return (
    (selection.selectedThreadRootId !== null &&
      (thread.rootId === selection.selectedThreadRootId ||
        thread.parentId === selection.selectedThreadRootId)) ||
    thread.parentId === selection.selectedEventId
  );
}

export function getReactionTargetId(tags: string[][]) {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    const tag = tags[index];
    if (tag?.[0] === "e" && typeof tag[1] === "string") {
      return tag[1];
    }
  }

  return null;
}

/**
 * Maps a formatted timeline message into the inbox detail pane's context
 * message shape. Extracted from HomeView's `contextMessages` memo so the
 * field selection is unit-testable: `kind` and `signerPubkey` must survive
 * this mapping for the config-nudge trust gate
 * (`getConfigNudgeAuthorPubkey`) to run in `InboxMessageRow` — an earlier
 * version dropped them, structurally disabling the card on the inbox
 * surface.
 */
export function toInboxContextMessage(
  message: TimelineMessage,
  context: {
    eventById: ReadonlyMap<string, RelayEvent>;
    fallbackAuthorPubkey: string;
    profiles: Record<string, UserProfileSummary> | undefined;
    selectedItemId: string;
  },
): InboxContextMessage {
  const event = context.eventById.get(message.id);
  const authorPubkey =
    message.pubkey ?? event?.pubkey ?? context.fallbackAuthorPubkey;
  const { mentionNames, mentionPubkeysByName } = resolveMentionProps(
    message.tags ?? [],
    context.profiles,
    message.body,
  );
  return {
    id: message.id,
    authorLabel: message.author,
    authorPubkey,
    isAgent: message.isAgent,
    ownerLabel: message.ownerLabel,
    ownerPubkey: message.ownerPubkey,
    avatarUrl: message.avatarUrl ?? null,
    content: message.body,
    createdAt: message.createdAt,
    depth: event
      ? getContextMessageDepth(event, context.eventById)
      : message.depth,
    fullTimestampLabel: formatInboxFullTimestamp(message.createdAt),
    isSelected: message.id === context.selectedItemId,
    kind: message.kind,
    mentionNames: mentionNames ?? [],
    mentionPubkeysByName,
    reactions: message.reactions,
    signerPubkey: message.signerPubkey,
    tags: message.tags,
    timeLabel: message.time,
  };
}

/**
 * Converts an inbox context message back into the `TimelineMessage` shape
 * the shared message components consume (action bar, reactions, and the
 * config-nudge gate — `kind` and `signerPubkey` ride through for
 * `getConfigNudgeAuthorPubkey`).
 */
export function toTimelineMessage(
  message: InboxContextMessage,
): TimelineMessage {
  const threadReference = getThreadReference(message.tags ?? []);
  return {
    id: message.id,
    author: message.authorLabel,
    isAgent: message.isAgent,
    ownerLabel: message.ownerLabel,
    ownerPubkey: message.ownerPubkey,
    avatarUrl: message.avatarUrl,
    body: message.content,
    createdAt: message.createdAt,
    depth: message.depth,
    kind: message.kind,
    parentId: message.parentId ?? threadReference.parentId,
    pubkey: message.authorPubkey,
    reactions: message.reactions ?? [],
    rootId: message.rootId ?? threadReference.rootId,
    signerPubkey: message.signerPubkey,
    tags: message.tags,
    time: message.timeLabel ?? message.fullTimestampLabel,
  };
}

import {
  type ComponentType,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import type { InboxItem } from "@/features/home/lib/inbox";
import type { RankedThread } from "@/features/messages/lib/threadRouting";
import type { RelayEvent } from "@/shared/api/types";

type Slots = {
  sidebar: Record<string, never>;
  channelHeader: { openThread: (id: string) => void };
  timeline: { children: ReactNode; openThread: (id: string) => void };
  composer: Record<string, never>;
  channelMargin: Record<string, never>;
  message: { id: string };
  thread: Record<string, never>;
  picker: {
    options: RankedThread[];
    pick: (id: string | null) => void;
    close: () => void;
  };
  pageActions: Record<string, never>;
  pageContents: { scroll: (id: string) => void };
  inboxActions: Record<string, never>;
  inboxEntries: Record<string, never>;
  inboxFilter: {
    items: InboxItem[];
    doneSet: ReadonlySet<string>;
    onSelect: (id: string) => void;
  };
  inboxStatus: { item: InboxItem; isDone: boolean };
};

type FeedBucket = "mentions" | "needs_action" | "activity" | "agent_activity";
type FeedItem = Parameters<
  typeof import("@/shared/api/tauri").fromRawFeedItem
>[0];
type Profile = {
  pubkey: string;
  displayName: string;
  about?: string;
  isAgent?: boolean;
};

export type Scenario = {
  title: string;
  route?: string;
  visibleChannels?: string[];
  channels?: Record<string, { name: string; topic?: string }>;
  replaceMessageBody?: string[];
  messages?: Record<string, RelayEvent[]>;
  feed?: FeedItem[];
  profiles?: Profile[];
  page?: RelayEvent[];
  slots?: { [K in keyof Slots]?: ComponentType<Slots[K]> };
  prepare?: (view: string | null) => Promise<void>;
  filterInbox?: (item: InboxItem, filter: string, isDone: boolean) => boolean;
};

let scenario: Scenario | undefined;

export function configureMockup(value: Scenario) {
  scenario = value;
}

export function hasMockupSlot(name: keyof Slots) {
  return Boolean(scenario?.slots?.[name]);
}

export function MockupSlot<K extends keyof Slots>({
  name,
  context,
}: {
  name: K;
  context?: Slots[K];
}) {
  const Slot = scenario?.slots?.[name] as ComponentType<Slots[K]> | undefined;
  return Slot ? <Slot {...(context ?? ({} as Slots[K]))} /> : null;
}

export function MockupTimeline(props: Slots["timeline"]) {
  const Timeline = scenario?.slots?.timeline;
  return Timeline ? <Timeline {...props} /> : props.children;
}

export function applyMockupFixtures({
  channels,
  messages,
  feed,
}: {
  channels: { id: string; name: string; topic: string | null }[];
  messages: Map<string, RelayEvent[]>;
  feed: Record<FeedBucket, FeedItem[]>;
}) {
  for (const channel of channels) {
    const fixture = scenario?.channels?.[channel.id];
    if (fixture) Object.assign(channel, fixture);
  }
  for (const [id, events] of Object.entries(scenario?.messages ?? {})) {
    messages.set(id, structuredClone(events));
  }
  for (const event of scenario?.feed ?? []) {
    const bucket = event.category === "mention" ? "mentions" : event.category;
    feed[bucket].push(structuredClone(event));
  }
}

export function hasMockupFeed() {
  return scenario?.feed !== undefined;
}

export function emitMockupPage(
  filter: {
    kinds?: number[];
    ids?: string[];
    authors?: string[];
    "#e"?: string[];
    "#h"?: string[];
  },
  emit: (event: RelayEvent) => void,
) {
  if (!scenario?.page || !filter.kinds?.includes(40004)) return false;
  for (const event of scenario.page) {
    if (filter.ids && !filter.ids.includes(event.id)) continue;
    if (filter.authors && !filter.authors.includes(event.pubkey)) continue;
    if (
      filter["#e"] &&
      !event.tags.some(([tag, id]) => tag === "e" && filter["#e"]?.includes(id))
    )
      continue;
    if (
      filter["#h"] &&
      !event.tags.some(([tag, id]) => tag === "h" && filter["#h"]?.includes(id))
    )
      continue;
    emit(event);
  }
  return true;
}

let inboxFilter = "All";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setMockupInboxFilter(filter: string) {
  inboxFilter = filter;
  for (const listener of listeners) listener();
}

export function useMockupInboxFilter() {
  return useSyncExternalStore(subscribe, () => inboxFilter);
}

export function useMockupInboxItems(
  items: InboxItem[],
  doneSet: ReadonlySet<string>,
) {
  const filter = useMockupInboxFilter();
  return scenario?.filterInbox && filter !== "All"
    ? items.filter((item) =>
        scenario?.filterInbox?.(item, filter, doneSet.has(item.id)),
      )
    : items;
}

export function hasMockupMessageBody(id: string) {
  return scenario?.replaceMessageBody?.includes(id) ?? false;
}

export function showMockupChannel(id: string) {
  return scenario?.visibleChannels?.includes(id) ?? true;
}

export async function mockupReleaseResponse(
  _url: string,
  _options: RequestInit,
) {
  return new Response("[]", {
    headers: { "Content-Type": "application/json" },
  });
}

export async function mockupRelayInfo(_url: string, _options: RequestInit) {
  return new Response("{}", {
    headers: { "Content-Type": "application/nostr+json" },
  });
}

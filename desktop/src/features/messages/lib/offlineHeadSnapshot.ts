import type { RelayEvent } from "@/shared/api/types";
import {
  compareRelayOrder,
  type ChannelWindowStore,
} from "./channelWindowStore";

/** Fold committed live overlays into a bounded cache page, retaining aux and summaries. */
export function offlineHeadSnapshot(
  store: ChannelWindowStore,
  channelId: string,
  limit: number,
): RelayEvent[] | null {
  if (!store.pages.length) return null;
  const candidates = new Map<string, RelayEvent>();
  for (const row of store.pages.slice(0, 2).flatMap((page) => page.rows))
    candidates.set(row.event.id, row.event);
  for (const event of store.liveOverlay)
    if (!event.pending) candidates.set(event.id, event);
  const all = [...candidates.values()]
    .filter((event) => !event.pending)
    .sort(compareRelayOrder);
  const rows = all.slice(0, limit);
  const lastPage = store.pages[Math.min(1, store.pages.length - 1)];
  const hasMore = all.length > limit || lastPage.hasMore;
  const last = rows.at(-1);
  const ids = new Set(rows.map((event) => event.id));
  const aux = new Map<string, RelayEvent>();
  const candidatesAux = [
    ...store.pages.slice(0, 2).flatMap((page) => page.aux),
    ...store.liveAux,
  ].filter((event) => !event.pending);
  // Include deletion-of-reaction/edit closure, without retaining unopened reply bodies.
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of candidatesAux) {
      if (aux.has(event.id)) continue;
      const targets = event.tags
        .filter((tag) => tag[0] === "e")
        .map((tag) => tag[1]);
      const selected =
        event.kind === 5 || event.kind === 9005
          ? targets.some((target) => ids.has(target))
          : (event.kind === 7 || event.kind === 40003) &&
            ids.has(targets.at(-1) ?? "");
      if (selected) {
        aux.set(event.id, event);
        ids.add(event.id);
        changed = true;
      }
    }
  }
  const meta = (
    kind: number,
    id: string,
    tags: string[][],
    content: unknown,
  ): RelayEvent => ({
    id,
    kind,
    tags,
    content: JSON.stringify(content),
    pubkey: "",
    sig: "",
    created_at: 0,
  });
  const summaries = rows.flatMap((event) => {
    const summary =
      store.liveSummaries[event.id]?.summary ??
      store.pages
        .flatMap((page) => page.rows)
        .find((row) => row.event.id === event.id)?.thread;
    return summary
      ? [
          meta(39005, `cached-summary:${event.id}`, [["e", event.id]], {
            reply_count: summary.replyCount,
            descendant_count: summary.descendantCount,
            last_reply_at: summary.lastReplyAt,
            participants: summary.participantPubkeys,
          }),
        ]
      : [];
  });
  return [
    ...rows,
    ...aux.values(),
    ...summaries,
    meta(
      39006,
      `cached-bounds:${channelId}`,
      [["d", `${channelId.toLowerCase()}:head`]],
      {
        has_more: hasMore && !!last,
        next_cursor:
          hasMore && last ? { created_at: last.created_at, id: last.id } : null,
      },
    ),
  ];
}

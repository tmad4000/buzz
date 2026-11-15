import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { PIN_KIND } from "./model";
export async function setMessagePin(
  channel: string,
  id: string,
  pinned: boolean,
) {
  // Read our previous timestamp so sequential clicks in one second still order.
  const previous = await relayClient.fetchEvents({
    kinds: [PIN_KIND],
    "#h": [channel],
    "#e": [id],
    limit: 500,
  });
  const event = await signRelayEvent({
    kind: PIN_KIND,
    content: pinned ? "pin" : "unpin",
    tags: [
      ["h", channel],
      ["e", id],
    ],
  });
  const own = previous.filter((e) => e.pubkey === event.pubkey);
  const createdAt = Math.max(
    Math.floor(Date.now() / 1000),
    ...own.map((e) => e.created_at + 1),
  );
  const ordered = await signRelayEvent({
    kind: PIN_KIND,
    content: event.content,
    tags: event.tags,
    createdAt,
  });
  await relayClient.publishEvent(
    ordered,
    "Pin timed out",
    "Could not update pin",
  );
}

export async function fetchPinHistory(channel: string) {
  const events = [];
  let cursor: { until?: number; before_id?: string } = {};
  for (;;) {
    const page = await relayClient.fetchEvents({
      kinds: [PIN_KIND],
      "#h": [channel],
      limit: 500,
      ...cursor,
    });
    events.push(...page);
    if (page.length < 500) return events;
    const last = [...page]
      .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
      .at(-1)!;
    if (cursor.before_id === last.id)
      throw new Error("Relay did not advance pin history cursor");
    cursor = { until: last.created_at, before_id: last.id };
  }
}

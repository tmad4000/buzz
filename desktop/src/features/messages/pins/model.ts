import type { RelayEvent } from "@/shared/api/types";
export const PIN_KIND = 40004;
export function targetId(event: RelayEvent): string | undefined {
  return event.tags.find((tag) => tag[0] === "e")?.[1];
}
// A signer can only remove their own pin. Stable event ordering also resolves
// concurrent operations with equal timestamps independently of arrival order.
export function activePins(
  events: RelayEvent[],
  channel: string,
): RelayEvent[] {
  const latest = new Map<string, RelayEvent>();
  for (const event of [...events].sort(
    (a, b) => a.created_at - b.created_at || b.id.localeCompare(a.id),
  )) {
    if (
      event.kind !== PIN_KIND ||
      !event.tags.some((t) => t[0] === "h" && t[1] === channel)
    )
      continue;
    const target = targetId(event);
    if (
      !target ||
      !/^[a-f0-9]{64}$/.test(target) ||
      !["pin", "unpin"].includes(event.content)
    )
      continue;
    latest.set(`${event.pubkey}:${target}`, event);
  }
  return [...latest.values()].filter((e) => e.content === "pin");
}

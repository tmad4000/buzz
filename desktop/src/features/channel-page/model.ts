import type { RelayEvent } from "@/shared/api/types";
export const PAGE_KIND = 40101;
export const PAGE_SLOT = "page";
export const PAGE_MAX_BYTES = 512 * 1024;
export function validatePage(html: string): void {
  if (new TextEncoder().encode(html).byteLength > PAGE_MAX_BYTES)
    throw new Error("Page exceeds 512 KiB");
}
/** One shared head across all authors; same timestamp uses the lowest event ID. */
export function pageHead(
  events: RelayEvent[],
  channel: string,
): RelayEvent | null {
  return (
    [...events]
      .filter(
        (e) =>
          e.kind === PAGE_KIND &&
          e.tags.some((t) => t[0] === "h" && t[1] === channel) &&
          e.tags.some((t) => t[0] === "d" && t[1] === PAGE_SLOT) &&
          new TextEncoder().encode(e.content).byteLength <= PAGE_MAX_BYTES,
      )
      .sort(
        (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
      )[0] ?? null
  );
}

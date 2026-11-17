import type { RelayEvent } from "@/shared/api/types";
/** Reuse the hosted relay's channel-scoped pin kind; Page markers never look like pins. */
export const PAGE_KIND = 40004;
export const PAGE_SLOT = "buzz-page:page";
export const PAGE_ANCHOR =
  "b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1";
export const PAGE_MAX_BYTES = 512 * 1024;
export const PAGE_CHUNK_BYTES = 24 * 1024;
export const PAGE_MAX_CHUNKS = 24;
export type PageManifest = {
  type: "buzz.page";
  version: 1;
  page: "page";
  publication: string;
  chunks: string[];
  bytes: number;
};
const size = (text: string) => new TextEncoder().encode(text).byteLength;
export function validatePage(html: string): void {
  if (size(html) > PAGE_MAX_BYTES) throw new Error("Page exceeds 512 KiB");
}
export function pageManifest(
  event: RelayEvent,
  channel: string,
): PageManifest | null {
  if (
    event.kind !== PAGE_KIND ||
    !event.tags.some((t) => t[0] === "e" && t[1] === PAGE_ANCHOR) ||
    !event.tags.some((t) => t[0] === "h" && t[1] === channel) ||
    !event.tags.some((t) => t[0] === "d" && t[1] === PAGE_SLOT) ||
    size(event.content) > 8192
  )
    return null;
  try {
    const p = JSON.parse(event.content);
    if (
      p.type !== "buzz.page" ||
      p.version !== 1 ||
      p.page !== "page" ||
      typeof p.publication !== "string" ||
      !/^[a-f0-9-]{36}$/.test(p.publication) ||
      !Array.isArray(p.chunks) ||
      p.chunks.length > PAGE_MAX_CHUNKS ||
      !p.chunks.every(
        (id: unknown) => typeof id === "string" && /^[a-f0-9]{64}$/.test(id),
      ) ||
      new Set(p.chunks).size !== p.chunks.length ||
      !Number.isSafeInteger(p.bytes) ||
      p.bytes < 0 ||
      p.bytes > PAGE_MAX_BYTES ||
      (p.bytes === 0) !== (p.chunks.length === 0)
    )
      return null;
    return p;
  } catch {
    return null;
  }
}
/** Shared head across authors; timestamp ties use the relay's lowest event ID. */
export function pageHead(
  events: RelayEvent[],
  channel: string,
): RelayEvent | null {
  return (
    [...events]
      .filter((e) => pageManifest(e, channel))
      .sort(
        (a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
export function splitPageHtml(html: string): string[] {
  validatePage(html);
  const bytes = new TextEncoder().encode(html),
    decoder = new TextDecoder("utf-8", { fatal: true }),
    parts: string[] = [];
  for (let i = 0; i < bytes.length; i += PAGE_CHUNK_BYTES)
    parts.push(
      decoder.decode(bytes.subarray(i, i + PAGE_CHUNK_BYTES), {
        stream: i + PAGE_CHUNK_BYTES < bytes.length,
      }),
    );
  return parts;
}
export function assemblePage(
  head: RelayEvent,
  events: RelayEvent[],
  channel: string,
): string {
  const manifest = pageManifest(head, channel);
  if (!manifest) throw new Error("Invalid Page manifest");
  const byId = new Map(events.map((e) => [e.id, e]));
  const html = manifest.chunks
    .map((id, index) => {
      const e = byId.get(id);
      if (
        !e ||
        e.kind !== PAGE_KIND ||
        e.pubkey !== head.pubkey ||
        !e.tags.some((t) => t[0] === "h" && t[1] === channel) ||
        !e.tags.some(
          (t) =>
            t[0] === "d" &&
            t[1] === `buzz-page:chunk:${manifest.publication}:${index}`,
        )
      )
        throw new Error("Page chunk missing or wrong author/channel");
      const chunk = JSON.parse(e.content);
      if (
        chunk.type !== "buzz.page.chunk" ||
        chunk.version !== 1 ||
        chunk.page !== "page" ||
        chunk.publication !== manifest.publication ||
        chunk.index !== index ||
        typeof chunk.html !== "string" ||
        size(chunk.html) > PAGE_CHUNK_BYTES + 4
      )
        throw new Error("Invalid Page chunk");
      return chunk.html;
    })
    .join("");
  validatePage(html);
  if (size(html) !== manifest.bytes)
    throw new Error("Page byte count mismatch");
  return html;
}

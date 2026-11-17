import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { getChannelMembers } from "@/shared/api/tauriChannels";
import type { RelayEvent } from "@/shared/api/types";
import {
  PAGE_KIND,
  PAGE_SLOT,
  PAGE_ANCHOR,
  PAGE_MAX_CHUNKS,
  pageHead,
  pageManifest,
  splitPageHtml,
  assemblePage,
} from "./model";
export async function getPageAuthors(channel: string): Promise<string[]> {
  return [
    ...new Set(
      (await getChannelMembers(channel, { readYourWrites: true })).map(
        (member) => member.pubkey,
      ),
    ),
  ].sort();
}
export const pageFilter = (channel: string, authors?: string[]) => ({
  kinds: [PAGE_KIND],
  ...(authors ? { authors } : {}),
  "#h": [channel],
  "#e": [PAGE_ANCHOR],
  limit: 1,
});
export async function getPageHtml(
  head: RelayEvent,
  channel: string,
): Promise<string> {
  const manifest = pageManifest(head, channel);
  if (!manifest) throw new Error("Invalid Page manifest");
  if (!manifest.chunks.length) return "";
  let failure: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt)
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    try {
      return assemblePage(
        head,
        await relayClient.fetchEvents({
          kinds: [PAGE_KIND],
          ids: manifest.chunks,
          "#h": [channel],
          limit: PAGE_MAX_CHUNKS,
        }),
        channel,
      );
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}
export async function setPage(
  channel: string,
  html: string,
  afterCreatedAt = 0,
) {
  const parts = splitPageHtml(html),
    publication = crypto.randomUUID();
  const authors = await getPageAuthors(channel);
  if (!authors.length)
    throw new Error("Only channel members can replace the Page");
  const head = pageHead(
    await relayClient.fetchEvents(pageFilter(channel, authors)),
    channel,
  );
  const now = Math.floor(Date.now() / 1000),
    createdAt = Math.max(now, (head?.created_at ?? 0) + 1, afterCreatedAt + 1);
  if (createdAt > now + 300)
    throw new Error("Page head is too far in the future");
  const sign = (content: unknown, slot: string) =>
    signRelayEvent({
      kind: PAGE_KIND,
      content: JSON.stringify(content),
      createdAt,
      tags: [
        ["h", channel],
        ["d", slot],
        ...(slot === PAGE_SLOT ? [["e", PAGE_ANCHOR]] : []),
        ["t", "buzz-page-v1"],
      ],
    });
  const draft = await sign(
    {
      type: "buzz.page",
      version: 1,
      page: "page",
      publication,
      chunks: [],
      bytes: 0,
    },
    PAGE_SLOT,
  );
  if (!authors.includes(draft.pubkey))
    throw new Error("Only channel members can replace the Page");
  const chunks: string[] = [];
  // Acknowledge every immutable chunk before publishing the manifest. Failed
  // uploads leave the previous Page head visible and retry remains possible.
  for (const [index, part] of parts.entries()) {
    const chunk = await sign(
      {
        type: "buzz.page.chunk",
        version: 1,
        page: "page",
        publication,
        index,
        html: part,
      },
      `buzz-page:chunk:${publication}:${index}`,
    );
    await relayClient.publishEvent(
      chunk,
      "Page chunk timed out",
      "Could not upload Page chunk",
    );
    chunks.push(chunk.id);
  }
  if (!(await getPageAuthors(channel)).includes(draft.pubkey))
    throw new Error("Channel membership changed before Page commit");
  const event = await sign(
    {
      type: "buzz.page",
      version: 1,
      page: "page",
      publication,
      chunks,
      bytes: new TextEncoder().encode(html).byteLength,
    },
    PAGE_SLOT,
  );
  await relayClient.publishEvent(
    event,
    "Page timed out",
    "Could not update Page",
  );
  return event;
}

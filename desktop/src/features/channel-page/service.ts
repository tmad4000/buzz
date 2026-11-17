import { relayClient } from "@/shared/api/relayClient";
import { signRelayEvent } from "@/shared/api/tauri";
import { PAGE_KIND, PAGE_SLOT, pageHead, validatePage } from "./model";
export const pageFilter = (channel: string) => ({
  kinds: [PAGE_KIND],
  "#h": [channel],
  "#d": [PAGE_SLOT],
  limit: 1,
});
export async function setPage(
  channel: string,
  html: string,
  afterCreatedAt = 0,
) {
  validatePage(html);
  const head = pageHead(
    await relayClient.fetchEvents(pageFilter(channel)),
    channel,
  );
  const now = Math.floor(Date.now() / 1000);
  const createdAt = Math.max(
    now,
    (head?.created_at ?? 0) + 1,
    afterCreatedAt + 1,
  );
  if (createdAt > now + 300)
    throw new Error("Page head is too far in the future");
  const event = await signRelayEvent({
    kind: PAGE_KIND,
    content: html,
    createdAt,
    tags: [
      ["h", channel],
      ["d", PAGE_SLOT],
      ["m", "text/html"],
    ],
  });
  await relayClient.publishEvent(
    event,
    "Page timed out",
    "Could not update Page",
  );
  return event;
}

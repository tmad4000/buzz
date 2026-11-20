import type { RelayEvent } from "@/shared/api/types";

export const FIXTURE_THREAD = "1".padStart(64, "0");
export const CHANNEL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
export const AUTHOR = "deadbeef".repeat(8);
/** Seed the same in-memory Tauri bridge used by the Buzz mockup kit. */
export function seedAutoRouteThread(
  channels: {
    id: string;
    name: string;
    topic: string | null;
    visibility: "open" | "private";
  }[],
  messages: Map<string, RelayEvent[]>,
) {
  const channel = channels.find(({ id }) => id === CHANNEL_ID);
  if (!channel) throw new Error("Fixture channel missing");
  channel.name = "Release questions";
  channel.topic = "Synthetic private thread";
  channel.visibility = "private";
  messages.set(CHANNEL_ID, [
    {
      id: FIXTURE_THREAD,
      kind: 9,
      pubkey: AUTHOR,
      content: "Release questions · Auto-route fixture",
      created_at: Math.floor(Date.now() / 1_000) - 60,
      tags: [["h", CHANNEL_ID]],
      sig: "0".repeat(128),
    },
  ]);
}

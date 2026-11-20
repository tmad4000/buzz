import type { RelayEvent } from "@/shared/api/types";
import { OVERRIDES_KEY } from "@/shared/features/store";
import { FIXTURE_THREAD } from "./AutoRouteThread";
import { installMockupNavigationGuard } from "./navigation";

export const CHANNEL_ID = "9a1657ac-f7aa-5db0-b632-d8bbeb6dfb50";
const AUTHOR = "deadbeef".repeat(8);
const relayUrl = "wss://buzz-auto-route.invalid";
const communityId = "buzz-auto-route-fixture";

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

// This offline fixture also runs over the private HTTP preview origin.
function installHttpFixturePrimitives() {
  if (!crypto.randomUUID) {
    const randomUUID = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };
    Object.defineProperty(crypto, "randomUUID", { value: randomUUID });
  }
  if (!navigator.mediaDevices) {
    Object.defineProperty(navigator, "mediaDevices", {
      value: Object.assign(new EventTarget(), {
        enumerateDevices: async () => [],
        getUserMedia: async () => {
          throw new DOMException(
            "The fixture has no capture devices",
            "NotFoundError",
          );
        },
      }),
    });
  }
}

async function bootstrap() {
  installMockupNavigationGuard();
  installHttpFixturePrimitives();
  const theme =
    new URLSearchParams(location.search).get("theme") === "dark"
      ? "buzz-dark"
      : "buzz";
  document.documentElement.classList.add(
    theme === "buzz-dark" ? "dark" : "light",
  );
  localStorage.setItem("buzz-theme", theme);
  localStorage.setItem("buzz-follow-system", "false");
  localStorage.setItem(
    "buzz-communities",
    JSON.stringify([
      {
        id: communityId,
        name: "Buzz Fixture",
        relayUrl,
        pubkey: AUTHOR,
        addedAt: "2026-11-20T00:00:00Z",
      },
    ]),
  );
  localStorage.setItem("buzz-active-community-id", communityId);
  localStorage.setItem(`buzz-onboarding-complete.v1:${AUTHOR}`, "true");
  localStorage.setItem(
    `buzz-onboarding-complete.v1:${AUTHOR}:${relayUrl}`,
    "true",
  );
  localStorage.setItem(OVERRIDES_KEY, "{}");
  window.__BUZZ_E2E__ = {
    mode: "mock",
    relayWsUrl: relayUrl,
    mock: { searchProfiles: [{ pubkey: AUTHOR, displayName: "Demo author" }] },
  };
  history.replaceState(
    null,
    "",
    `#/channels/${CHANNEL_ID}?thread=${FIXTURE_THREAD}`,
  );
  const { maybeInstallE2eTauriMocks } = await import("@/testing/e2eBridge");
  maybeInstallE2eTauriMocks();
  await import("@/main");
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  const root = document.getElementById("root");
  if (root) root.textContent = "Buzz fixture failed to start.";
});

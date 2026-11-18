import {
  FEATURE_OVERRIDES_STORAGE_KEY,
  PREVIEW_FEATURE_IDS,
} from "../tests/helpers/features";
import { CHANNEL, JACOB, SIDE, profiles } from "./fixtures";
import { configureMockup, type Scenario } from "./runtime";
import "./mockup.css";
import { waitFor } from "./presentation";

const scenarios = import.meta.glob<{ default: Scenario }>("./scenarios/*.tsx");
const params = new URLSearchParams(location.search);
const slug = params.get("scenario") ?? "shell";
const relayUrl = "wss://buzz-mockup.invalid";
const communityId = "buzz-mockup";

async function bootstrap() {
  const scenario = (await scenarios[`./scenarios/${slug}.tsx`]?.())?.default;
  if (!scenario) throw new Error(`Unknown Buzz scenario: ${slug}`);
  const theme = params.get("theme") === "dark" ? "buzz-dark" : "buzz";
  document.title = `Buzz · ${scenario.title}`;
  document.documentElement.classList.add(
    theme === "buzz-dark" ? "dark" : "light",
  );
  document.documentElement.dataset.mockupScenario = slug;
  configureMockup({
    visibleChannels: [CHANNEL, SIDE, "cf63feec-21bb-5bf0-a2f8-0e4c3de8ec73"],
    ...scenario,
  });

  localStorage.setItem("buzz-theme", theme);
  localStorage.setItem("buzz-follow-system", "false");
  localStorage.setItem(
    "buzz-communities",
    JSON.stringify([
      {
        id: communityId,
        name: "Buzz",
        relayUrl,
        pubkey: JACOB,
        addedAt: "2026-11-18T00:00:00Z",
      },
    ]),
  );
  localStorage.setItem("buzz-active-community-id", communityId);
  localStorage.setItem(`buzz-onboarding-complete.v1:${JACOB}`, "true");
  localStorage.setItem(
    `buzz-onboarding-complete.v1:${JACOB}:${relayUrl}`,
    "true",
  );
  localStorage.setItem(
    FEATURE_OVERRIDES_STORAGE_KEY,
    JSON.stringify(
      Object.fromEntries(PREVIEW_FEATURE_IDS.map((id) => [id, true])),
    ),
  );
  window.__BUZZ_E2E__ = {
    mode: "mock",
    relayWsUrl: relayUrl,
    mock: { searchProfiles: scenario.profiles ?? profiles },
  };
  if (!location.hash) {
    history.replaceState(
      null,
      "",
      `#${scenario.route ?? `/channels/${CHANNEL}`}`,
    );
  }
  const { maybeInstallE2eTauriMocks } = await import("@/testing/e2eBridge");
  maybeInstallE2eTauriMocks();
  await import("@/main");
  await waitFor('[data-testid="app-sidebar"]');
  if (location.hash.startsWith("#/channels/"))
    await waitFor('[data-testid="chat-title"]');
  if (params.get("present") !== "0")
    await scenario.prepare?.(params.get("view"));
  document.documentElement.dataset.mockupReady = "true";
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  document.documentElement.dataset.mockupReady = "error";
});

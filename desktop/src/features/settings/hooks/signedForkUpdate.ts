import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { isAutoUpdateSupported } from "@/shared/api/tauri";
import { forkVersion } from "../forkRelease";

/** Discovery metadata is NOT signature proof; only native download verifies bytes. */
export function isNewerSignedForkCandidate(
  update: Pick<Update, "version" | "currentVersion" | "rawJson">,
  current: string,
): boolean {
  const from = forkVersion(`buzz-ideaflow-v${current}`);
  const to = forkVersion(`buzz-ideaflow-v${update.version}`);
  if (
    !from ||
    !to ||
    update.currentVersion !== current ||
    ![...from, ...to].every(Number.isSafeInteger)
  )
    return false;
  const different = to.findIndex((value, i) => value !== from[i]);
  if (different < 0 || to[different] <= from[different]) return false;
  const raw = update.rawJson;
  if (!raw || raw.version !== update.version) return false;
  const candidates =
    raw.platforms && typeof raw.platforms === "object"
      ? Object.values(raw.platforms)
      : [raw];
  return (
    candidates.length > 0 &&
    candidates.every((candidate) => {
      if (!candidate || typeof candidate !== "object") return false;
      const { signature, url } = candidate as {
        signature?: unknown;
        url?: unknown;
      };
      if (
        typeof signature !== "string" ||
        !signature.trim() ||
        typeof url !== "string"
      )
        return false;
      try {
        const asset = new URL(url);
        return (
          asset.protocol === "https:" &&
          asset.hostname === "github.com" &&
          !asset.port &&
          !asset.username &&
          !asset.password &&
          !asset.search &&
          !asset.hash &&
          asset.pathname.startsWith(
            `/tmad4000/buzz/releases/download/buzz-ideaflow-v${update.version}/`,
          )
        );
      } catch {
        return false;
      }
    })
  );
}

export async function discoverSignedForkUpdate(
  current: string,
): Promise<Update | null> {
  if (!isTauri()) return null;
  // The current Windows installer exits directly, outside Buzz's graceful
  // request_restart path. Retain manual installation there rather than bypass it.
  if (/^win/i.test(navigator.platform)) return null;
  let update: Update | null;
  try {
    if (!(await isAutoUpdateSupported())) return null;
    // Uses ONLY the release's configured native endpoint/key. Never override a
    // feed/key in JS, never convert GitHub release-list metadata into an updater.
    update = await check({ timeout: 15000, allowDowngrades: false });
  } catch {
    return null; // Unconfigured/unavailable plugin retains existing manual flow.
  }
  if (!update) return null;
  if (isNewerSignedForkCandidate(update, current)) return update;
  await update.close();
  return null;
}

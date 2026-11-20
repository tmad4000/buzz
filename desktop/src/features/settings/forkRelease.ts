export const FORK_RELEASE_FEED =
  "https://api.github.com/repos/tmad4000/buzz/releases?per_page=100";
export const FORK_RELEASES_URL = "https://github.com/tmad4000/buzz/releases";

/** Numbered Ideaflow builds, with an optional version-only proof revision. */
export function forkVersion(tag: string): number[] | null {
  if (typeof tag !== "string") return null;
  const match =
    /^buzz-ideaflow-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-ideaflow\.(0|[1-9]\d*)(?:\.([1-9]\d*))?$/.exec(
      tag,
    );
  if (!match || match[0] !== tag) return null;
  const parts = match.slice(1).map((part) => Number(part ?? 0));
  return parts.every(Number.isSafeInteger) ? parts : null;
}

/** Ignore upstream tags, drafts, source-only releases and unrelated links. */
export function newerForkRelease(
  releases: unknown[],
  current: string,
  platform = "all",
): { version: string; releaseUrl: string } | null {
  if (typeof current !== "string" || typeof platform !== "string") return null;
  const installed = forkVersion(`buzz-ideaflow-v${current}`);
  if (!installed) return null;
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < 5; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  const installer = /mac/i.test(platform)
    ? /\.(dmg|app\.tar\.gz)$/
    : /win/i.test(platform)
      ? /\.(msi|exe)$/
      : /linux/i.test(platform)
        ? /\.(AppImage|deb)$/
        : /\.(dmg|app\.tar\.gz|AppImage|deb|msi|exe)$/;
  let newest = installed;
  let result = null;
  for (const value of releases) {
    if (!value || typeof value !== "object") continue;
    const r = value as {
      tag_name?: unknown;
      draft?: unknown;
      assets?: unknown;
      html_url?: unknown;
    };
    if (r.draft || typeof r.tag_name !== "string" || !Array.isArray(r.assets))
      continue;
    const version = forkVersion(r.tag_name);
    const releaseVersion = r.tag_name.replace(/^buzz-ideaflow-v/, "");
    const macZips = ["arm64", "x64"].map(
      (arch) => `Buzz-Ideaflow-${releaseVersion}-macos-${arch}.zip`,
    );
    if (
      !version ||
      compare(version, newest) <= 0 ||
      r.html_url !== `${FORK_RELEASES_URL}/tag/${r.tag_name}`
    )
      continue;
    if (
      !r.assets.some(
        (a) =>
          a &&
          typeof a.name === "string" &&
          (installer.test(a.name) ||
            (/mac/i.test(platform) && macZips.includes(a.name))),
      )
    )
      continue;
    newest = version;
    result = {
      version: r.tag_name.replace(/^buzz-ideaflow-v/, ""),
      releaseUrl: r.html_url,
    };
  }
  return result;
}

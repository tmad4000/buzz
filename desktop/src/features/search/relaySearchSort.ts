/** True when NIP-11 says the relay can order search by date (`NOSTR.md`). */
export function advertisesSearchSort(info: unknown): boolean {
  const extensions = (info as { supported_extensions?: unknown } | null)
    ?.supported_extensions;
  return Array.isArray(extensions) && extensions.includes("buzz-search-sort");
}

const PROBE_TIMEOUT_MS = 3_000;

/**
 * Ask the relay whether it accepts `search_sort`. Throws when the relay
 * cannot be read; callers then use windowed narrowing, which needs no support.
 */
export async function fetchRelaySearchSortSupport(
  relayHttpUrl: string,
): Promise<boolean> {
  const url = `${relayHttpUrl.replace(/\/+$/, "")}/info`;
  const response = await fetch(url, {
    headers: { Accept: "application/nostr+json" },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Could not read relay capabilities (${response.status})`);
  }
  return advertisesSearchSort(await response.json());
}

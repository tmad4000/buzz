import { setLocalStorageItemWithRecovery } from "@/shared/lib/localStorageQuota";

export type ThreadExpansion = ReadonlyMap<string, boolean>;

/** Namespace thread preferences by community, identity, channel and root. */
export function threadExpansionKey(
  community: string | null,
  identity: string | undefined,
  channel: string | null,
  root: string | null,
): string | null {
  return channel && root
    ? `buzz-thread-expansion.v1:${JSON.stringify([community, identity ?? null, channel, root])}`
    : null;
}

/** Missing preferences are initialized once; saved choices always win. */
export function resolveThreadExpansion(
  saved: ThreadExpansion,
  branches: Iterable<string>,
  unreadBranches: ReadonlySet<string> | null,
): ThreadExpansion {
  if (!unreadBranches) return saved;
  let next: Map<string, boolean> | undefined;
  for (const id of branches) {
    if (saved.has(id)) continue;
    next ??= new Map(saved);
    next.set(id, unreadBranches.has(id));
  }
  return next ?? saved;
}

/** Read only validated branch IDs and booleans; unavailable storage is harmless. */
export function loadThreadExpansion(key: string | null): ThreadExpansion {
  if (!key) return new Map();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Map();
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries)) return new Map();
    return new Map(
      entries.filter(
        (entry): entry is [string, boolean] =>
          Array.isArray(entry) &&
          entry.length === 2 &&
          typeof entry[0] === "string" &&
          typeof entry[1] === "boolean",
      ),
    );
  } catch (error) {
    console.warn("[threadExpansion] Could not read saved thread view", error);
    return new Map();
  }
}

/** One atomic snapshot; quota recovery reports failures without losing the view. */
export function saveThreadExpansion(key: string, branches: ThreadExpansion) {
  return setLocalStorageItemWithRecovery(key, JSON.stringify([...branches]));
}

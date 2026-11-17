import { setLocalStorageItemWithRecovery } from "@/shared/lib/localStorageQuota";

export type ThreadExpansion = ReadonlyMap<string, boolean>;
const failedSnapshots = new Map<string, ThreadExpansion>();
export const THREAD_EXPANSION_CHANGED = "buzz-thread-expansion-changed";
export type ThreadExpansionChange = {
  key: string;
  branches: ThreadExpansion;
  persisted: boolean;
};

/** Namespace thread preferences by community, identity, channel and root. */
export function threadExpansionKey(
  community: string | null,
  identity: string | undefined,
  channel: string | null,
  root: string | null,
  viewInstanceId?: string,
): string | null {
  if (!channel || !root) return null;
  const resource = [community, identity ?? null, channel, root];
  return viewInstanceId === undefined
    ? `buzz-thread-expansion.v1:${JSON.stringify(resource)}`
    : `buzz-thread-expansion.v2:${JSON.stringify([...resource, viewInstanceId])}`;
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
  const failed = failedSnapshots.get(key);
  if (failed) return failed;
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
  const persisted = setLocalStorageItemWithRecovery(
    key,
    JSON.stringify([...branches]),
  );
  if (persisted) failedSnapshots.delete(key);
  else failedSnapshots.set(key, new Map(branches));
  // Same-document surfaces share manual choices even if storage is unavailable.
  if (typeof window.dispatchEvent === "function" && window.CustomEvent)
    window.dispatchEvent(
      new window.CustomEvent<ThreadExpansionChange>(THREAD_EXPANSION_CHANGED, {
        detail: { key, branches, persisted },
      }),
    );
  return persisted;
}

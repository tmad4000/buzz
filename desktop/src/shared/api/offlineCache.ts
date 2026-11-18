import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri, nip44DecryptFromSelf, nip44EncryptToSelf } from "./tauri";

export type OfflineScope = { pubkey: string; relayUrl: string };
export type OfflineKind = "head" | "thread" | "sidebar" | "profile";
export type OfflineRecord = {
  scope: string;
  id: string;
  kind: OfflineKind;
  ciphertext: string;
  savedAt: number;
  lastVisitedAt: number;
  bytes: number;
};
export interface OfflineCacheAdapter {
  list(scope: string, kind: OfflineKind): Promise<OfflineRecord[]>;
  put(record: OfflineRecord): Promise<void>;
  clear(scope: string): Promise<void>;
}
export const offlineCaps = {
  head: [64, 1024 * 1024],
  thread: [200, 256 * 1024],
  sidebar: [1, 1024 * 1024],
  profile: [2000, 32 * 1024],
} as const;
export const OFFLINE_SCOPE_BYTES = 48 * 1024 * 1024;
/** Explicit opt-in; unavailable signers fail closed rather than persisting plaintext. */
export function offlineCacheEnabled(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage.getItem("buzz-offline-cache-v1") === "on"
    );
  } catch {
    return false;
  }
}
export function offlineScopeKey(scope: OfflineScope): string {
  const relay = new URL(scope.relayUrl);
  relay.hash = "";
  relay.pathname = relay.pathname.replace(/\/+$/, "");
  return JSON.stringify([
    scope.pubkey.toLowerCase(),
    relay.toString().replace(/\/$/, ""),
  ]);
}
/** Replaceable signer seam: every platform uses NIP-44-to-self, including web. */
export interface OfflineCipher {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}
type BrowserSigner = {
  getPublicKey(): Promise<string>;
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
};
function browserSigner(): BrowserSigner {
  const signer = (window as Window & { nostr?: BrowserSigner }).nostr;
  if (!signer?.nip44)
    throw new Error("A NIP-44 browser signer is required for offline cache");
  return signer;
}
let cipher: OfflineCipher = {
  async encrypt(plaintext) {
    if (isTauri()) return nip44EncryptToSelf(plaintext);
    const signer = browserSigner();
    return signer.nip44!.encrypt(await signer.getPublicKey(), plaintext);
  },
  async decrypt(ciphertext) {
    if (isTauri()) return nip44DecryptFromSelf(ciphertext);
    const signer = browserSigner();
    return signer.nip44!.decrypt(await signer.getPublicKey(), ciphertext);
  },
};
async function assertOwner(scope: OfflineScope): Promise<void> {
  const identity = isTauri()
    ? await invokeTauri<{ pubkey: string; locked?: boolean; lost?: boolean }>(
        "get_identity",
      )
    : {
        pubkey: await browserSigner().getPublicKey(),
        locked: false,
        lost: false,
      };
  if (
    identity.locked ||
    identity.lost ||
    identity.pubkey.toLowerCase() !== scope.pubkey.toLowerCase()
  )
    throw new Error("Offline cache identity is unavailable");
}
export function setOfflineCipher(next: OfflineCipher): void {
  cipher = next;
}
const nativeAdapter: OfflineCacheAdapter = {
  list: (scope, kind) => invokeTauri("offline_cache_list", { scope, kind }),
  put: (record) => invokeTauri("offline_cache_put", { record }),
  clear: (scope) => invokeTauri("offline_cache_clear", { scope }),
};
const generations = new Map<string, number>();
let globalGeneration = 0;
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("buzz-offline-cache-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("records", {
        keyPath: ["scope", "kind", "id"],
      });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
  }));
}
/** Select evictions using the same ordering for every browser write. */
export function offlineEvictions(rows: OfflineRecord[]): OfflineRecord[] {
  const ordered = [...rows].sort(
    (a, b) => b.lastVisitedAt - a.lastVisitedAt || a.id.localeCompare(b.id),
  );
  const counts: Partial<Record<OfflineKind, number>> = {};
  const evicted: OfflineRecord[] = [];
  let bytes = 0;
  for (const row of ordered) {
    const count = (counts[row.kind] = (counts[row.kind] ?? 0) + 1);
    if (
      count > offlineCaps[row.kind][0] ||
      bytes + row.bytes > OFFLINE_SCOPE_BYTES
    )
      evicted.push(row);
    else bytes += row.bytes;
  }
  return evicted;
}
async function mutate(scope: string, record?: OfflineRecord): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    const request = store.getAll();
    request.onsuccess = () => {
      let rows = (request.result as OfflineRecord[]).filter(
        (r) => r.scope === scope,
      );
      if (!record) {
        for (const row of rows) store.delete([scope, row.kind, row.id]);
        return;
      }
      rows = rows.filter((r) => r.kind !== record.kind || r.id !== record.id);
      rows.push(record);
      store.put(record);
      for (const row of offlineEvictions(rows))
        store.delete([scope, row.kind, row.id]);
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error("Offline cache transaction failed"));
  });
}
export const indexedDbOfflineAdapter: OfflineCacheAdapter = {
  async list(scope, kind) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("records")
        .objectStore("records")
        .getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as OfflineRecord[])
            .filter((r) => r.scope === scope && r.kind === kind)
            .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt),
        );
      request.onerror = () => reject(request.error);
    });
  },
  put: (record) => mutate(record.scope, record),
  clear: (scope) => mutate(scope),
};
export function offlineAdapter(): OfflineCacheAdapter {
  return isTauri() ? nativeAdapter : indexedDbOfflineAdapter;
}
/** Chunk below NIP-44's 65535-byte plaintext bound; payload and routing are authenticated together. */
export async function saveOffline(
  scope: OfflineScope,
  kind: OfflineKind,
  id: string,
  payload: unknown,
): Promise<void> {
  if (!offlineCacheEnabled()) return;
  await assertOwner(scope);
  const key = offlineScopeKey(scope);
  const generation = generations.get(key) ?? 0;
  const globalAtStart = globalGeneration;
  const plaintext = JSON.stringify({ scope: key, kind, id, payload });
  if (new TextEncoder().encode(plaintext).length > offlineCaps[kind][1]) return;
  // 8000 UTF-16 units fit even for four-byte Unicode and escaped surrogates.
  const chunks: string[] = [];
  for (let i = 0; i < plaintext.length; ) {
    let end = Math.min(i + 8000, plaintext.length);
    if (end < plaintext.length && /[\uD800-\uDBFF]/.test(plaintext[end - 1]))
      end--;
    chunks.push(await cipher.encrypt(plaintext.slice(i, end)));
    i = end;
  }
  const ciphertext = JSON.stringify(chunks);
  const now = Date.now();
  await assertOwner(scope);
  if (
    (generations.get(key) ?? 0) !== generation ||
    globalAtStart !== globalGeneration ||
    !offlineCacheEnabled()
  )
    return;
  await offlineAdapter().put({
    scope: key,
    kind,
    id,
    ciphertext,
    savedAt: now,
    lastVisitedAt: now,
    bytes: new TextEncoder().encode(ciphertext).length,
  });
}
export async function loadOffline<T>(
  scope: OfflineScope,
  kind: OfflineKind,
  id?: string | readonly string[],
  limit: number = offlineCaps[kind][0],
): Promise<Array<{ id: string; payload: T; savedAt: number }>> {
  if (!offlineCacheEnabled()) return [];
  await assertOwner(scope);
  const key = offlineScopeKey(scope);
  const readGeneration = generations.get(key) ?? 0;
  const readGlobal = globalGeneration;
  const result: Array<{ id: string; payload: T; savedAt: number }> = [];
  for (const row of (await offlineAdapter().list(key, kind))
    .filter(
      (row) =>
        id === undefined ||
        (typeof id === "string" ? row.id === id : id.includes(row.id)),
    )
    .slice(0, limit)) {
    try {
      if (
        typeof row.ciphertext !== "string" ||
        row.ciphertext.length > offlineCaps[kind][1] * 3 ||
        row.bytes !== new TextEncoder().encode(row.ciphertext).length
      )
        continue;
      const chunks: unknown = JSON.parse(row.ciphertext);
      if (
        !Array.isArray(chunks) ||
        chunks.length > 140 ||
        chunks.some((c) => typeof c !== "string")
      )
        continue;
      const text = (
        await Promise.all(chunks.map((c) => cipher.decrypt(c)))
      ).join("");
      const value = JSON.parse(text);
      if (value.scope === key && value.kind === kind && value.id === row.id) {
        if (
          (generations.get(key) ?? 0) !== readGeneration ||
          readGlobal !== globalGeneration
        )
          return [];
        result.push({
          id: row.id,
          payload: value.payload,
          savedAt: row.savedAt,
        });
        await offlineAdapter().put({ ...row, lastVisitedAt: Date.now() });
      }
    } catch {
      /* Corrupt/wrong-identity rows are disposable snapshots, never live data. */
    }
  }
  await assertOwner(scope);
  if (
    (generations.get(key) ?? 0) !== readGeneration ||
    readGlobal !== globalGeneration
  )
    return [];
  return result;
}
export async function clearOffline(scope: OfflineScope): Promise<void> {
  const key = offlineScopeKey(scope);
  generations.set(key, (generations.get(key) ?? 0) + 1);
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new window.CustomEvent("buzz-offline-cache-cleared", { detail: key }),
    );
  await offlineAdapter().clear(key);
}
/** Fence in-flight encryption before identity reset; browser payloads are removed too. */
export async function clearOfflineForLogout(): Promise<void> {
  globalGeneration++;
  if (isTauri()) return; // Native reset removes App Support and WebKit as one operation.
  if (typeof indexedDB === "undefined") return;
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("records", "readwrite");
    tx.objectStore("records").clear();
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}

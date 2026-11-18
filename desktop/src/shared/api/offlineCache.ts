import { isTauri } from "@tauri-apps/api/core";
import { invokeTauri } from "./tauri";

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
  cacheEpoch?: number;
  touch?: boolean;
};
export interface OfflineCacheAdapter {
  epoch(): Promise<number>;
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
  encrypt(plaintext: string, expectedPubkey: string): Promise<string>;
  decrypt(ciphertext: string, expectedPubkey: string): Promise<string>;
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
/** A future browser host must pin the sender account for the whole callback.
 * NIP-07 exposes only an active signer, so before/after identity checks alone
 * cannot implement this lease. No lease or browser transport is installed here.
 */
export type BrowserAccountLease = <T>(
  expectedPubkey: string,
  operation: () => Promise<T>,
) => Promise<T>;
/** Opt-in window.nostr.nip44 seam, deliberately unwired in the desktop/mobile product. */
export function createBrowserOfflineCipher(
  withAccount: BrowserAccountLease,
): OfflineCipher {
  const run = (
    expectedPubkey: string,
    direction: "encrypt" | "decrypt",
    value: string,
  ) =>
    withAccount(expectedPubkey, async () => {
      const signer = browserSigner();
      const owner = await signer.getPublicKey();
      if (owner.toLowerCase() !== expectedPubkey.toLowerCase())
        throw new Error("Offline cache signer changed");
      const result = await signer.nip44![direction](expectedPubkey, value);
      if (
        browserSigner() !== signer ||
        (await signer.getPublicKey()).toLowerCase() !==
          expectedPubkey.toLowerCase()
      )
        throw new Error("Offline cache signer changed");
      return result;
    });
  return {
    encrypt: (value, owner) => run(owner, "encrypt", value),
    decrypt: (value, owner) => run(owner, "decrypt", value),
  };
}
/** Default identity-fenced bridge cipher; exposed for adapter-level regression tests. */
export function createOfflineCipher(): OfflineCipher {
  return {
    async encrypt(plaintext, expectedPubkey) {
      if (isTauri())
        return invokeTauri<string>("offline_cache_encrypt", {
          plaintext,
          expectedPubkey,
        });
      throw new Error(
        "An identity-bound NIP-44 browser cipher must be configured",
      );
    },
    async decrypt(ciphertext, expectedPubkey) {
      if (isTauri())
        return invokeTauri<string>("offline_cache_decrypt", {
          ciphertext,
          expectedPubkey,
        });
      throw new Error(
        "An identity-bound NIP-44 browser cipher must be configured",
      );
    },
  };
}
async function payloadHash(text: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await globalThis.crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
let cipher: OfflineCipher = createOfflineCipher();
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
/** Browser hosts must atomically bind each operation to expectedPubkey; active-account NIP-07 alone is insufficient. */
export function setOfflineCipher(next: OfflineCipher): void {
  cipher = next;
}
let nativeOperations: Promise<unknown> = Promise.resolve();
function nativeCacheOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = nativeOperations.then(operation);
  nativeOperations = result.catch(() => {});
  return result;
}
const nativeAdapter: OfflineCacheAdapter = {
  epoch: () =>
    nativeCacheOperation(() => invokeTauri<number>("offline_cache_epoch")),
  list: (scope, kind) =>
    nativeCacheOperation(() =>
      invokeTauri<OfflineRecord[]>("offline_cache_list", { scope, kind }),
    ),
  put: (record) =>
    nativeCacheOperation(() =>
      invokeTauri<void>("offline_cache_put", { record }),
    ),
  clear: (scope) =>
    nativeCacheOperation(() =>
      invokeTauri<void>("offline_cache_clear", { scope }),
    ),
};
let migration: Promise<void> | undefined;
/** Complete opt-in disposal, independent of account/signer availability. OFF is read-only. */
export function prepareOfflineCache(): Promise<void> {
  if (!offlineCacheEnabled()) return Promise.resolve();
  return (migration ??= (async () => {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    );
    for (const key of keys)
      if (
        key?.startsWith("buzz-channels.v1:") ||
        key?.startsWith("buzz-user-labels.v1:")
      )
        storage.removeItem(key);
    if (isTauri())
      await nativeCacheOperation(() =>
        invokeTauri<void>("offline_cache_migrate"),
      );
  })().catch((error) => {
    migration = undefined;
    throw error;
  }));
}
const generations = new Map<string, number>();
const pendingWrites = new Map<string, symbol>();
let globalGeneration = 0;
let logoutInProgress = false;
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  return (database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("buzz-offline-cache-v1", 3);
    let abandoned = false;
    request.onblocked = () => {
      abandoned = true;
      database = undefined;
      reject(
        new Error(
          "Offline cache upgrade blocked by another tab; close it and retry",
        ),
      );
    };
    request.onupgradeneeded = () => {
      const transaction = request.transaction;
      if (!transaction)
        throw new Error("Offline cache upgrade transaction missing");
      const records = request.result.objectStoreNames.contains("records")
        ? transaction.objectStore("records")
        : request.result.createObjectStore("records", {
            keyPath: ["scope", "kind", "id"],
          });
      if (!request.result.objectStoreNames.contains("epochs"))
        request.result.createObjectStore("epochs", { keyPath: "id" });
      if (!records.indexNames.contains("scope"))
        records.createIndex("scope", "scope");
    };
    request.onsuccess = () => {
      if (abandoned) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => {
        request.result.close();
        database = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      if (abandoned) return;
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
async function mutate(
  scope: string | null,
  record?: OfflineRecord,
): Promise<void> {
  const database = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(["records", "epochs"], "readwrite");
    const store = tx.objectStore("records");
    const epochs = tx.objectStore("epochs");
    const epochRequest = epochs.get("global");
    epochRequest.onsuccess = () => {
      const current =
        (epochRequest.result as { value: number } | undefined)?.value ?? 0;
      // A clear in another tab fences a signer/encryption promise captured before that clear.
      if (record && record.cacheEpoch !== current) return;
      if (!record) epochs.put({ id: "global", value: current + 1 });
      if (scope === null) {
        store.clear();
        return;
      }
      const request = store.index("scope").getAll(scope);
      request.onsuccess = () => {
        let rows = (request.result as OfflineRecord[]).filter(
          (row) => row.scope === scope,
        );
        if (!record) {
          for (const row of rows) store.delete([scope, row.kind, row.id]);
          return;
        }
        if (
          rows.some(
            (row) =>
              row.kind === record.kind &&
              row.id === record.id &&
              row.savedAt > record.savedAt,
          )
        )
          return;
        if (
          record.touch &&
          !rows.some(
            (row) =>
              row.kind === record.kind &&
              row.id === record.id &&
              row.savedAt === record.savedAt &&
              row.ciphertext === record.ciphertext,
          )
        )
          return;
        rows = rows.filter(
          (row) => row.kind !== record.kind || row.id !== record.id,
        );
        rows.push(record);
        store.put(record);
        for (const row of offlineEvictions(rows))
          store.delete([scope, row.kind, row.id]);
      };
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(tx.error ?? new Error("Offline cache transaction failed"));
  });
}
export const indexedDbOfflineAdapter: OfflineCacheAdapter = {
  async epoch() {
    const database = await db();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("epochs")
        .objectStore("epochs")
        .get("global");
      request.onsuccess = () =>
        resolve((request.result as { value: number } | undefined)?.value ?? 0);
      request.onerror = () => reject(request.error);
    });
  },
  async list(scope, kind) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const request = database
        .transaction("records")
        .objectStore("records")
        .index("scope")
        .getAll(scope);
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
  if (!offlineCacheEnabled() || logoutInProgress) return;
  const key = offlineScopeKey(scope);
  const savedAt = Date.now();
  const writeKey = JSON.stringify([key, kind, id]);
  const token = Symbol();
  pendingWrites.set(writeKey, token);
  try {
    const generation = generations.get(key) ?? 0;
    const globalAtStart = globalGeneration;
    await prepareOfflineCache();
    const [, storeEpoch] = await Promise.all([
      assertOwner(scope),
      offlineAdapter().epoch(),
    ]);
    const plaintext = JSON.stringify({
      scope: key,
      kind,
      id,
      savedAt,
      payload,
    });
    if (new TextEncoder().encode(plaintext).length > offlineCaps[kind][1])
      return;
    // 8000 UTF-16 units fit even for four-byte Unicode and escaped surrogates.
    const chunks: string[] = [];
    for (let i = 0; i < plaintext.length; ) {
      let end = Math.min(i + 8000, plaintext.length);
      if (end < plaintext.length && /[\uD800-\uDBFF]/.test(plaintext[end - 1]))
        end--;
      chunks.push(await cipher.encrypt(plaintext.slice(i, end), scope.pubkey));
      i = end;
    }
    chunks.unshift(
      await cipher.encrypt(
        JSON.stringify({
          digest: await payloadHash(plaintext),
          count: chunks.length,
        }),
        scope.pubkey,
      ),
    );
    const ciphertext = JSON.stringify(chunks);
    const now = Date.now();
    const [, currentStoreEpoch] = await Promise.all([
      assertOwner(scope),
      offlineAdapter().epoch(),
    ]);
    if (
      pendingWrites.get(writeKey) !== token ||
      currentStoreEpoch !== storeEpoch ||
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
      cacheEpoch: storeEpoch,
      savedAt,
      lastVisitedAt: now,
      bytes: new TextEncoder().encode(ciphertext).length,
    });
  } finally {
    if (pendingWrites.get(writeKey) === token) pendingWrites.delete(writeKey);
  }
}
export async function loadOffline<T>(
  scope: OfflineScope,
  kind: OfflineKind,
  id?: string | readonly string[],
  limit: number = offlineCaps[kind][0],
): Promise<Array<{ id: string; payload: T; savedAt: number }>> {
  if (!offlineCacheEnabled() || logoutInProgress) return [];
  const key = offlineScopeKey(scope);
  const readGeneration = generations.get(key) ?? 0;
  const readGlobal = globalGeneration;
  await prepareOfflineCache();
  const [, storeEpoch] = await Promise.all([
    assertOwner(scope),
    offlineAdapter().epoch(),
  ]);
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
      const decrypted = await Promise.all(
        chunks.map((c) => cipher.decrypt(c, scope.pubkey)),
      );
      const manifest = JSON.parse(decrypted[0]);
      const text = decrypted.slice(1).join("");
      if (
        manifest.count !== chunks.length - 1 ||
        manifest.digest !== (await payloadHash(text))
      )
        continue;
      const value = JSON.parse(text);
      if (
        value.scope === key &&
        value.kind === kind &&
        value.id === row.id &&
        value.savedAt === row.savedAt
      ) {
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
        await offlineAdapter().put({
          ...row,
          cacheEpoch: storeEpoch,
          touch: true,
          lastVisitedAt: Date.now(),
        });
      }
    } catch {
      /* Corrupt/wrong-identity rows are disposable snapshots, never live data. */
    }
  }
  const [, finalStoreEpoch] = await Promise.all([
    assertOwner(scope),
    offlineAdapter().epoch(),
  ]);
  if (
    finalStoreEpoch !== storeEpoch ||
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
  logoutInProgress = true;
  globalGeneration++;
  await nativeOperations;
  if (isTauri()) return; // Native reset removes App Support and WebKit as one operation.
  if (typeof indexedDB === "undefined") return;
  await mutate(null);
}

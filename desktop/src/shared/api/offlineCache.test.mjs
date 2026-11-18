import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { JSDOM } from "jsdom";
import { nip44 } from "nostr-tools";
import {
  loadOffline,
  saveOffline,
  clearOffline,
  offlineScopeKey,
  offlineCacheEnabled,
  setOfflineCipher,
  createOfflineCipher,
  createBrowserOfflineCipher,
  clearOfflineForLogout,
  prepareOfflineCache,
} from "./offlineCache.ts";
const dom = new JSDOM("", { url: "http://offline.test" });
const pubkey = "f".repeat(64);
const scope = { pubkey, relayUrl: "wss://relay.test/" };
const rows = new Map();
const key = nip44.v2.utils.getConversationKey(
  new Uint8Array(32).fill(1),
  "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
);
let locked = false;
let migrations = 0;
let migrationSawLocked = false;
let activePubkey = pubkey;
let switchDuringEncryption = false;
let bridgeEncryptions = 0;
let nativeWriteGate = null;
let nativeWriteStarted = false;
const realCipher = {
  encrypt: async (text) => nip44.v2.encrypt(text, key),
  decrypt: async (text) => nip44.v2.decrypt(text, key),
};
before(() => {
  globalThis.window = dom.window;
  globalThis.isTauri = true;
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      if (command === "offline_cache_epoch") return 0;
      if (command === "offline_cache_migrate") {
        migrations++;
        migrationSawLocked = locked;
        return;
      }
      if (command === "get_identity") return { pubkey: activePubkey, locked };
      if (command === "offline_cache_encrypt") {
        if (args.expectedPubkey !== activePubkey)
          throw new Error("Offline cache signer changed");
        bridgeEncryptions++;
        const encrypted = nip44.v2.encrypt(args.plaintext, key);
        if (switchDuringEncryption) activePubkey = "b".repeat(64);
        return encrypted;
      }
      if (command === "offline_cache_decrypt") {
        if (args.expectedPubkey !== activePubkey)
          throw new Error("Offline cache signer changed");
        return nip44.v2.decrypt(args.ciphertext, key);
      }
      if (command === "offline_cache_put") {
        nativeWriteStarted = true;
        if (nativeWriteGate) await nativeWriteGate;
        rows.set(
          JSON.stringify([args.record.scope, args.record.kind, args.record.id]),
          args.record,
        );
        return;
      }
      if (command === "offline_cache_list")
        return [...rows.values()].filter(
          (row) => row.scope === args.scope && row.kind === args.kind,
        );
      if (command === "offline_cache_clear")
        for (const [id, row] of rows)
          if (row.scope === args.scope) rows.delete(id);
    },
  };
  setOfflineCipher(realCipher);
});
after(() => dom.window.close());
test("R4 full-scope opt-in migration runs while locked and preserves unrelated storage; OFF is inert", async () => {
  const legacy = [
    "buzz-channels.v1:wss://one:alice",
    "buzz-channels.v1:wss://two:bob",
    "buzz-user-labels.v1:wss://one",
    "buzz-user-labels.v1:wss://two",
  ];
  for (const key of legacy)
    window.localStorage.setItem(key, "plaintext fixture");
  window.localStorage.setItem("unrelated-draft", "keep");
  await prepareOfflineCache();
  assert.equal(migrations, 0);
  for (const key of legacy)
    assert.notEqual(window.localStorage.getItem(key), null);
  locked = true;
  window.localStorage.setItem("buzz-offline-cache-v1", "on");
  try {
    await prepareOfflineCache();
    assert.equal(migrations, 1);
    assert.equal(
      migrationSawLocked,
      true,
      "native all-scope disposal does not depend on unlocked identity",
    );
    for (const key of legacy)
      assert.equal(window.localStorage.getItem(key), null);
    assert.equal(window.localStorage.getItem("unrelated-draft"), "keep");
    await assert.rejects(loadOffline(scope, "head"), /unavailable/);
  } finally {
    locked = false;
    window.localStorage.removeItem("buzz-offline-cache-v1");
  }
});

test("off by default; all payloads encrypted with actual NIP44, Unicode chunks and scope binding", async () => {
  assert.equal(offlineCacheEnabled(), false);
  await saveOffline(scope, "head", "a", ["secret"]);
  assert.equal(rows.size, 0);
  window.localStorage.setItem("buzz-offline-cache-v1", "on");
  const payload = { text: "x".repeat(7900) + "🐝".repeat(20000) };
  await saveOffline(scope, "head", "a", payload);
  const record = [...rows.values()][0];
  assert.ok(!record.ciphertext.includes("🐝"));
  assert.ok(JSON.parse(record.ciphertext).length > 1);
  assert.deepEqual((await loadOffline(scope, "head"))[0].payload, payload);
  const pieces = JSON.parse(record.ciphertext);
  [pieces[1], pieces[2]] = [pieces[2], pieces[1]];
  rows.set(JSON.stringify([record.scope, record.kind, record.id]), {
    ...record,
    ciphertext: JSON.stringify(pieces),
  });
  assert.deepEqual(
    await loadOffline(scope, "head"),
    [],
    "chunk reordering cannot construct another authenticated snapshot",
  );
  rows.set(JSON.stringify([record.scope, record.kind, record.id]), record);
  assert.deepEqual(
    await loadOffline({ ...scope, relayUrl: "wss://other.test" }, "head"),
    [],
  );
  // Even a copied ciphertext under another relay's routing metadata cannot hydrate.
  rows.set("tamper", {
    ...record,
    scope: offlineScopeKey({ ...scope, relayUrl: "wss://other.test" }),
  });
  assert.deepEqual(
    await loadOffline({ ...scope, relayUrl: "wss://other.test" }, "head"),
    [],
  );
  rows.set(JSON.stringify([record.scope, record.kind, record.id]), {
    ...record,
    savedAt: record.savedAt + 1,
  });
  assert.deepEqual(
    await loadOffline(scope, "head"),
    [],
    "disk metadata cannot make an older snapshot look fresh",
  );
  locked = true;
  await assert.rejects(loadOffline(scope, "head"), /unavailable/);
  locked = false;
  await clearOffline(scope);
  assert.deepEqual(await loadOffline(scope, "head"), []);
});
test("clear fences encryption in flight and oversized JSON is never persisted", async () => {
  rows.clear();
  let release;
  setOfflineCipher({
    ...realCipher,
    encrypt: (text) =>
      release
        ? realCipher.encrypt(text)
        : new Promise((resolve) => {
            release = async () => resolve(await realCipher.encrypt(text));
          }),
  });
  const saving = saveOffline(scope, "profile", "pending", { name: "private" });
  while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
  await clearOffline(scope);
  await release();
  await saving;
  assert.equal(rows.size, 0);
  setOfflineCipher(realCipher);
  await saveOffline(scope, "profile", "too-big", { text: "x".repeat(32768) });
  assert.equal(rows.size, 0);
});

test("production eviction policy bounds each unit and total encrypted bytes", async () => {
  const { offlineEvictions, OFFLINE_SCOPE_BYTES } = await import(
    "./offlineCache.ts"
  );
  const make = (kind, id, bytes = 1) => ({
    scope: "scope",
    kind,
    id: `${id}`,
    ciphertext: "cipher",
    bytes,
    savedAt: id,
    lastVisitedAt: id,
  });
  const heads = Array.from({ length: 70 }, (_, id) => make("head", id));
  assert.equal(offlineEvictions(heads).length, 6);
  assert.ok(offlineEvictions(heads).every((row) => Number(row.id) < 6));
  const threads = Array.from({ length: 205 }, (_, id) => make("thread", id));
  assert.equal(offlineEvictions(threads).length, 5);
  const huge = [
    make("head", 1, OFFLINE_SCOPE_BYTES / 2),
    make("thread", 2, OFFLINE_SCOPE_BYTES / 2),
    make("sidebar", 3, OFFLINE_SCOPE_BYTES / 2),
  ];
  assert.deepEqual(
    offlineEvictions(huge).map((row) => row.id),
    ["1"],
  );
});

test("production bridge cipher pins every chunk to the scoped account during a signer switch", async () => {
  rows.clear();
  activePubkey = pubkey;
  bridgeEncryptions = 0;
  switchDuringEncryption = true;
  setOfflineCipher(createOfflineCipher());
  try {
    await assert.rejects(
      saveOffline(scope, "head", "race", { text: "x".repeat(16000) }),
      /signer changed/,
    );
    assert.equal(bridgeEncryptions, 1);
    assert.equal(rows.size, 0);
  } finally {
    switchDuringEncryption = false;
    activePubkey = pubkey;
    setOfflineCipher(realCipher);
  }
});

test("native clear waits for an already-dispatched write so late completion cannot refill cache", async () => {
  rows.clear();
  nativeWriteStarted = false;
  let release;
  nativeWriteGate = new Promise((resolve) => {
    release = resolve;
  });
  const saving = saveOffline(scope, "sidebar", "sidebar", ["queued"]);
  while (!nativeWriteStarted)
    await new Promise((resolve) => setTimeout(resolve, 0));
  let cleared = false;
  const clearing = clearOffline(scope).then(() => {
    cleared = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(cleared, false);
  release();
  await saving;
  await clearing;
  nativeWriteGate = null;
  assert.equal(rows.size, 0);
});

test("unwired window.nostr NIP44 seam requires a host account lease and rejects wrong/switched owners", async () => {
  let leaseCount = 0;
  let owner = pubkey;
  let switchOwner = false;
  let calls = 0;
  globalThis.isTauri = false;
  window.nostr = {
    getPublicKey: async () => owner,
    nip44: {
      encrypt: async (recipient, value) => {
        calls++;
        assert.equal(recipient, pubkey);
        const result = await realCipher.encrypt(value);
        if (switchOwner) owner = "b".repeat(64);
        return result;
      },
      decrypt: async (recipient, value) => {
        calls++;
        assert.equal(recipient, pubkey);
        return realCipher.decrypt(value);
      },
    },
  };
  const optIn = createBrowserOfflineCipher(async (expected, operation) => {
    leaseCount++;
    assert.equal(expected, pubkey);
    return operation();
  });
  try {
    const encrypted = await optIn.encrypt("cached payload", pubkey);
    assert.equal(await optIn.decrypt(encrypted, pubkey), "cached payload");
    assert.equal(leaseCount, 2);
    assert.equal(calls, 2);
    owner = "b".repeat(64);
    await assert.rejects(optIn.encrypt("private", pubkey), /signer changed/);
    assert.equal(calls, 2, "wrong owner cannot reach encryption");
    owner = pubkey;
    switchOwner = true;
    await assert.rejects(optIn.encrypt("private", pubkey), /signer changed/);
    delete window.nostr.nip44;
    await assert.rejects(
      optIn.decrypt(encrypted, pubkey),
      /NIP-44 browser signer/,
    );
  } finally {
    globalThis.isTauri = true;
    delete window.nostr;
  }
});

test("blocked IndexedDB upgrades fail promptly, close late results and allow retry", async () => {
  const { indexedDbOfflineAdapter } = await import("./offlineCache.ts");
  let request;
  let closed = false;
  globalThis.indexedDB = {
    open() {
      request = {};
      queueMicrotask(() => request.onblocked());
      return request;
    },
  };
  await assert.rejects(indexedDbOfflineAdapter.epoch(), /upgrade blocked/);
  request.result = {
    close() {
      closed = true;
    },
  };
  request.onsuccess();
  assert.equal(closed, true);
  // The next production-adapter test opens a fresh DB, verifying failed-open retry.
});

test("production IndexedDB adapter upgrades indexes and fences encryption across another tab's clear", async () => {
  const { OfflineIndexedDbModel } = await import("./offlineIndexedDbModel.mjs");
  const { indexedDbOfflineAdapter } = await import("./offlineCache.ts");
  globalThis.indexedDB = new OfflineIndexedDbModel();
  globalThis.isTauri = false;
  window.nostr = {
    getPublicKey: async () => pubkey,
    nip44: { encrypt: async () => "unused", decrypt: async () => "unused" },
  };
  setOfflineCipher(realCipher);
  const second = { ...scope, relayUrl: "wss://second.test" };
  try {
    setOfflineCipher(createOfflineCipher());
    await assert.rejects(
      saveOffline(scope, "head", "no-bound-signer", ["private"]),
      /identity-bound NIP-44/,
    );
    setOfflineCipher(realCipher);
    await saveOffline(scope, "head", "a", ["scope-one"]);
    await saveOffline(second, "head", "b", ["scope-two"]);
    assert.equal(
      (await indexedDbOfflineAdapter.list(offlineScopeKey(scope), "head"))
        .length,
      1,
    );
    await clearOffline(scope);
    assert.deepEqual(await loadOffline(scope, "head"), []);
    assert.deepEqual((await loadOffline(second, "head"))[0].payload, [
      "scope-two",
    ]);
    let release;
    setOfflineCipher({
      ...realCipher,
      encrypt: (text) =>
        release
          ? realCipher.encrypt(text)
          : new Promise((resolve) => {
              release = async () => resolve(await realCipher.encrypt(text));
            }),
    });
    const pending = saveOffline(scope, "sidebar", "late", [
      "before other tab cleared",
    ]);
    while (!release) await new Promise((resolve) => setTimeout(resolve, 0));
    // Bypass local JS generations, modeling a clear performed by another tab.
    await indexedDbOfflineAdapter.clear(offlineScopeKey(scope));
    await release();
    await pending;
    assert.deepEqual(
      await indexedDbOfflineAdapter.list(offlineScopeKey(scope), "sidebar"),
      [],
    );
    let releaseRead;
    setOfflineCipher({
      ...realCipher,
      decrypt: (text) =>
        releaseRead
          ? realCipher.decrypt(text)
          : new Promise((resolve) => {
              releaseRead = async () => resolve(await realCipher.decrypt(text));
            }),
    });
    const reading = loadOffline(second, "head");
    while (!releaseRead) await new Promise((resolve) => setTimeout(resolve, 0));
    await indexedDbOfflineAdapter.clear(offlineScopeKey(second));
    await releaseRead();
    assert.deepEqual(
      await reading,
      [],
      "a tab cannot hydrate a snapshot cleared during decryption",
    );
    assert.equal(globalThis.indexedDB.database.version, 3);
    const oldDatabase = globalThis.indexedDB.database;
    oldDatabase.onversionchange();
    assert.equal(
      oldDatabase.closed,
      true,
      "an upgrade in another tab is not blocked by this cache",
    );
    globalThis.indexedDB = new OfflineIndexedDbModel();
    assert.equal(
      await indexedDbOfflineAdapter.epoch(),
      0,
      "a closed connection is reopened on demand",
    );
  } finally {
    globalThis.isTauri = true;
    delete window.nostr;
    setOfflineCipher(realCipher);
  }
});

test("production profile snapshot listener persists labels without cached owner/agent authority", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  const { persistOfflineQueries } = await import(
    "@/features/messages/lib/offlineQueryCache"
  );
  rows.clear();
  globalThis.isTauri = true;
  setOfflineCipher(realCipher);
  const client = new QueryClient();
  const stop = persistOfflineQueries(client, scope);
  try {
    await client.fetchQuery({
      queryKey: ["users-batch", "author"],
      queryFn: async () => ({
        profiles: {
          author: {
            displayName: "Alice",
            name: "alice",
            avatarUrl: "https://image.test/a.png",
            nip05Handle: "alice@test",
            ownerPubkey: "owner",
            isAgent: true,
          },
        },
        missing: [],
      }),
    });
    for (
      let attempt = 0;
      attempt < 100 &&
      ![...rows.values()].some((row) => row.kind === "profile");
      attempt++
    )
      await new Promise((resolve) => setTimeout(resolve, 1));
    const [cached] = await loadOffline(scope, "profile", "author");
    assert.equal(cached.payload.displayName, "Alice");
    assert.equal(cached.payload.ownerPubkey, null);
    assert.equal(cached.payload.isAgent, false);
    assert.equal(
      client.getQueryData(["users-batch", "author"]).profiles.author
        .ownerPubkey,
      "owner",
    );
  } finally {
    stop();
    client.clear();
  }
});

test("late encryption cannot overwrite a newer successful snapshot of the same unit", async () => {
  rows.clear();
  let releaseOld;
  setOfflineCipher({
    ...realCipher,
    encrypt: (text) =>
      text.includes("old-payload")
        ? new Promise((resolve) => {
            releaseOld = async () => resolve(await realCipher.encrypt(text));
          })
        : realCipher.encrypt(text),
  });
  const older = saveOffline(scope, "sidebar", "sidebar", ["old-payload"]);
  while (!releaseOld) await new Promise((resolve) => setTimeout(resolve, 0));
  await saveOffline(scope, "sidebar", "sidebar", ["new-payload"]);
  await releaseOld();
  await older;
  setOfflineCipher(realCipher);
  assert.deepEqual((await loadOffline(scope, "sidebar"))[0].payload, [
    "new-payload",
  ]);
});

test("R1 hydration touch queued before clear cannot recreate a cleared native row", async () => {
  rows.clear();
  setOfflineCipher(realCipher);
  await saveOffline(scope, "head", "touch", ["private"]);
  let release;
  nativeWriteStarted = false;
  nativeWriteGate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    const reading = loadOffline(scope, "head", "touch");
    while (!nativeWriteStarted)
      await new Promise((resolve) => setTimeout(resolve, 0));
    const clearing = clearOffline(scope);
    release();
    assert.deepEqual(await reading, []);
    await clearing;
    assert.equal(rows.size, 0);
  } finally {
    release();
    nativeWriteGate = null;
  }
});

test("R3 actual NIP44 binds every chunk header and rejects cross-record cross-relay splice, reorder, duplicate and omission", async () => {
  rows.clear();
  setOfflineCipher(realCipher);
  const second = { ...scope, relayUrl: "wss://other.test/" };
  await saveOffline(scope, "head", "bundle", { text: "A".repeat(20000) });
  await saveOffline(second, "head", "bundle", { text: "B".repeat(20000) });
  const id = JSON.stringify([offlineScopeKey(scope), "head", "bundle"]);
  const original = rows.get(id);
  const other = [...rows.values()].find(
    (row) => row.scope === offlineScopeKey(second),
  );
  const a = JSON.parse(original.ciphertext),
    b = JSON.parse(other.ciphertext);
  const attacks = [
    [a[0], a[1], b[2]],
    [a[0], a[2], a[1]],
    [a[0], a[1], a[1]],
    [a[0], a[1]],
  ];
  for (const chunks of attacks) {
    const ciphertext = JSON.stringify(chunks);
    rows.set(id, {
      ...original,
      ciphertext,
      bytes: new TextEncoder().encode(ciphertext).length,
    });
    assert.deepEqual(await loadOffline(scope, "head", "bundle"), []);
  }
  // A valid NIP44 MAC is insufficient if the authenticated chunk header is wrong.
  const envelope = JSON.parse(await realCipher.decrypt(a[1]));
  assert.equal(envelope.scope, offlineScopeKey(scope));
  assert.equal(envelope.id, "bundle");
  assert.equal(envelope.index, 1);
  assert.equal(envelope.count, a.length);
  for (const [field, value] of Object.entries({
    scope: offlineScopeKey(second),
    id: "different",
    kind: "thread",
    index: 0,
    count: a.length + 1,
    bundle: "another-bundle",
    savedAt: original.savedAt + 1,
  })) {
    const altered = [...a];
    altered[1] = await realCipher.encrypt(
      JSON.stringify({ ...envelope, [field]: value }),
    );
    const ciphertext = JSON.stringify(altered);
    rows.set(id, {
      ...original,
      ciphertext,
      bytes: new TextEncoder().encode(ciphertext).length,
    });
    assert.deepEqual(
      await loadOffline(scope, "head", "bundle"),
      [],
      `authenticated ${field} mismatch must reject`,
    );
  }
  rows.set(id, original);
  assert.equal(
    (await loadOffline(scope, "head", "bundle"))[0].payload.text,
    "A".repeat(20000),
  );
});

test("logout drains dispatched native writes and prevents later writers before restart", async () => {
  rows.clear();
  let release;
  nativeWriteStarted = false;
  nativeWriteGate = new Promise((resolve) => {
    release = resolve;
  });
  try {
    const saving = saveOffline(scope, "head", "logout", ["private"]);
    while (!nativeWriteStarted)
      await new Promise((resolve) => setTimeout(resolve, 0));
    let cleared = false;
    const clearing = clearOfflineForLogout().then(() => {
      rows.clear();
      cleared = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(cleared, false);
    release();
    await Promise.all([saving, clearing]);
    await saveOffline(scope, "head", "late", ["private"]);
    assert.equal(rows.size, 0);
  } finally {
    release();
    nativeWriteGate = null;
  }
});

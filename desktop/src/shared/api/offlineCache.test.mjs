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
const realCipher = {
  encrypt: async (text) => nip44.v2.encrypt(text, key),
  decrypt: async (text) => nip44.v2.decrypt(text, key),
};
before(() => {
  globalThis.window = dom.window;
  globalThis.isTauri = true;
  window.__TAURI_INTERNALS__ = {
    invoke: async (command, args) => {
      if (command === "get_identity") return { pubkey, locked };
      if (command === "offline_cache_put") {
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
      new Promise((resolve) => {
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

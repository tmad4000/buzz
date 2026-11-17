import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { relayClient } from "@/shared/api/relayClient";
import { ArchiveEngine } from "./engine.ts";
import { archiveLane, archiveBucket } from "./model.ts";
const PK = "a".repeat(64),
  RELAY = "wss://archive.test";
const target = (id, kind = "message") => ({
  channelId: "c",
  rootId: kind === "thread" ? id : "r",
  targetId: id,
  kind,
  archivedAt: Date.now(),
  ...(kind === "thread" ? { replyIds: ["existing"] } : {}),
});
let engines, published, heads, listeners, seq;
const settle = async () => {
  for (let n = 0; n < 20; n++) await new Promise(setImmediate);
};
const advance = async (ms) => {
  mock.timers.tick(ms);
  await settle();
};
beforeEach(() => {
  window.localStorage.clear();
  engines = [];
  published = [];
  heads = new Map();
  listeners = [];
  seq = 0;
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1e12 });
  mock.method(relayClient, "fetchEvents", async (f) =>
    f["#d"].map((d) => heads.get(d)).filter(Boolean),
  );
  mock.method(relayClient, "subscribeLive", async (_f, cb) => {
    listeners.push(cb);
    return async () => {
      listeners = listeners.filter((item) => item !== cb);
    };
  });
  mock.method(relayClient, "subscribeToReconnects", () => () => {});
  mock.method(relayClient, "publishEvent", async (event, _t, _e, isCurrent) => {
    if (isCurrent && !isCurrent()) throw Error("stale scope");
    published.push(event);
    heads.set(event.tags.find((t) => t[0] === "d")[1], event);
    for (const cb of [...listeners]) cb(event);
  });
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      if (cmd === "nip44_encrypt_to_self") return args.plaintext;
      if (cmd === "nip44_decrypt_from_self") return args.ciphertext;
      if (cmd === "sign_event")
        return JSON.stringify({
          id: String(++seq).padStart(64, "0"),
          pubkey: PK,
          kind: args.kind,
          tags: args.tags,
          content: args.content,
          created_at: args.createdAt,
          sig: "test",
        });
      throw Error(`Unexpected action ${cmd}`);
    },
  };
});
afterEach(() => {
  for (const owner of engines) owner.destroy();
  mock.restoreAll();
  mock.timers.reset();
  delete window.__TAURI_INTERNALS__;
});
function engine(pk = PK, relay = RELAY) {
  const owner = new ArchiveEngine(pk, relay);
  engines.push(owner);
  return owner;
}
test("private archive syncs only encrypted settings, never messages or read/seen markers", async () => {
  const a = engine();
  await a.start();
  a.set("t:r", target("r", "thread"));
  assert.equal(a.isArchived("c", "reply", "r"), true);
  assert.equal(a.isArchived("other", "reply", "r"), false);
  await advance(2100);
  await advance(2100);
  assert.ok(published.length > 0);
  for (const event of published) {
    assert.equal(event.kind, 30078);
    assert.match(event.tags[0][1], /^personal-archive-v1:[a-f0-9]{2}$/);
    assert.equal(
      event.tags.some((tag) => tag.includes("r") || tag.includes("c")),
      false,
    );
  }
  window.localStorage.clear();
  const b = engine();
  await b.start();
  assert.equal(b.isArchived("c", "reply", "r"), true);
  const keys = Array.from({ length: window.localStorage.length }, (_, i) =>
    window.localStorage.key(i),
  );
  assert.equal(
    keys.some((key) => /read.state|thread:seen|msg:seen/.test(key)),
    false,
  );
});
test("replay keeps archive; backdated new reply restores it and invalidates stale Undo", async () => {
  const a = engine();
  await a.start();
  const token = a.set("t:r", target("r", "thread"));
  const reply = (id) => ({
    kind: 9,
    id,
    created_at: 1,
    tags: [
      ["h", "c"],
      ["e", "r", "", "root"],
      ["e", "r", "", "reply"],
    ],
  });
  a.observeLive(reply("existing"));
  assert.equal(a.isArchived("c", "existing", "r"), true);
  a.observeLive(reply("backdated"));
  assert.equal(a.isArchived("c", "backdated", "r"), false);
  assert.equal(a.undo(token), false);
  await advance(2100);
  await advance(2100);
  window.localStorage.clear();
  const b = engine();
  await b.start();
  assert.equal(b.isArchived("c", "existing", "r"), false);
});
test("Undo reverses own change; account and relay scopes stay separate after destruction", () => {
  const a = engine();
  const token = a.set("m:x", target("x"));
  assert.equal(a.undo(token), true);
  assert.equal(a.isArchived("c", "x", "r"), false);
  a.set("m:x", target("x"));
  const other = engine("b".repeat(64)),
    relay = engine(PK, "wss://other.test");
  assert.equal(other.get().records.size, 0);
  assert.equal(relay.get().records.size, 0);
  a.destroy();
  assert.throws(() => a.set("m:y", target("y")), /Account changed/);
  assert.equal(other.get().records.size, 0);
});
test("two devices preserve unrelated archives, unarchive tombstones and channel display preferences", async () => {
  const a = engine();
  await a.start();
  a.set("m:x", target("x"));
  a.setShowArchived("c", true);
  await advance(2100);
  await advance(2100);
  window.localStorage.clear();
  const b = engine();
  await b.start();
  assert.equal(b.showArchived("c"), true);
  b.set("m:y", target("y"));
  a.set("m:x", null);
  await advance(2100);
  await advance(2100);
  await advance(2100);
  assert.equal(a.isArchived("c", "x", "r"), false);
  assert.equal(b.isArchived("c", "x", "r"), false);
  assert.equal(a.isArchived("c", "y", "r"), true);
  assert.equal(b.isArchived("c", "y", "r"), true);
});
test("capacity rejects before local mutation; unreadable heads cannot be overwritten", async () => {
  const a = engine();
  assert.throws(
    () =>
      a.set("t:r", {
        ...target("r", "thread"),
        replyIds: Array.from({ length: 1000 }, (_, i) =>
          `${i}`.padStart(64, "a"),
        ),
      }),
    /capacity/,
  );
  assert.equal(a.get().records.size, 0);
  const lane = archiveLane(archiveBucket("m:x"));
  heads.set(lane.dTag, {
    id: "bad",
    kind: 30078,
    pubkey: PK,
    created_at: 1e9,
    content: "unreadable",
    tags: [["d", lane.dTag]],
  });
  await a.start();
  a.set("m:x", target("x"));
  await advance(2100);
  await advance(2100);
  assert.equal(published.length, 0);
});

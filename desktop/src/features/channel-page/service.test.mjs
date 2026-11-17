import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
const fixture = {
  events: [],
  members: [{ pubkey: "alice" }],
  sequence: 0,
  failIndex: null,
};
globalThis.pageServiceFixture = fixture;
registerHooks({
  resolve(s, c, n) {
    const names = {
      "@/shared/api/relayClient": "relay",
      "@/shared/api/tauri": "sign",
      "@/shared/api/tauriChannels": "members",
    };
    return names[s]
      ? { shortCircuit: true, url: `page-service:${names[s]}` }
      : n(s, c);
  },
  load(u, c, n) {
    const code = {
      "page-service:relay":
        'const f=globalThis.pageServiceFixture;export const relayClient={fetchEvents:async filter=>filter.ids?f.events.filter(e=>filter.ids.includes(e.id)):[],publishEvent:async e=>{const v=JSON.parse(e.content);if(v.type==="buzz.page.chunk"&&v.index===f.failIndex)throw Error("injected chunk rejection");f.events.push(e)}}',
      "page-service:sign":
        'const f=globalThis.pageServiceFixture;export async function signRelayEvent(e){return {...e,id:(++f.sequence).toString(16).padStart(64,"0"),pubkey:"alice",created_at:e.createdAt}}',
      "page-service:members":
        "export async function getChannelMembers(){return globalThis.pageServiceFixture.members}",
    };
    return code[u]
      ? { shortCircuit: true, format: "module", source: code[u] }
      : n(u, c);
  },
});
const { setPage, getPageHtml, pageFilter } = await import("./service.ts");
test("failed chunk leaves the shared head untouched; all acknowledged chunks precede manifest", async () => {
  const html = "é🙂".repeat(12000);
  fixture.failIndex = 1;
  await assert.rejects(setPage("private", html), /injected/);
  assert.ok(
    fixture.events.every(
      (e) => JSON.parse(e.content).type === "buzz.page.chunk",
    ),
  );
  fixture.events = [];
  fixture.failIndex = null;
  const root = await setPage("private", html);
  assert.equal(fixture.events.at(-1).id, root.id);
  assert.equal(await getPageHtml(root, "private"), html);
  assert.ok(
    fixture.events.every(
      (e) => new TextEncoder().encode(e.content).byteLength < 256 * 1024,
    ),
  );
});
test("nonmember cannot publish any Page event", async () => {
  fixture.events = [];
  fixture.members = [];
  await assert.rejects(setPage("private", "html"), /Only channel members/);
  assert.equal(fixture.events.length, 0);
});

test("head lookup uses the hosted pin index plus native author filtering", () => {
  const filter = pageFilter("private", ["alice"]);
  assert.deepEqual(filter.authors, ["alice"]);
  assert.deepEqual(filter["#e"], [
    "b54af358b595b466bdb36d30cc7f2d32385aaeb5731674dc557a030c234ea7d1",
  ]);
  assert.equal(filter["#d"], undefined);
  assert.equal(filter["#t"], undefined);
});

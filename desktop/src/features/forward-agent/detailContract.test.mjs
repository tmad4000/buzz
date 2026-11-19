import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { readForwardAudiences, needsAudienceConfirmation } from "./audience.ts";
import { messageMentionPubkeys } from "../messages/lib/messageMentionPubkeys.ts";
const self = "a".repeat(64),
  agent = "b".repeat(64);
function api() {
  const calls = [];
  let visibility = "private";
  let nextCursor = null;
  // Raw IPC detail contract, not a pre-populated frontend Channel fixture.
  const raw = (id) => ({
    id,
    name: id,
    channel_type: id === "dm" ? "dm" : "stream",
    visibility,
    description: "",
    topic: null,
    purpose: null,
    member_count: 0, // Actual legacy native metadata-only detail; roster owns membership.
    archived_at: null,
    created_by: self,
    created_at: "2026-11-18",
    updated_at: "2026-11-18",
  });
  const source = fs.readFileSync(
    new URL("../../shared/api/tauriChannels.ts", import.meta.url),
    "utf8",
  );
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(js, {
    module,
    exports: module.exports,
    require: (s) =>
      s === "@/shared/api/tauri"
        ? {
            invokeTauri: async (command, args) => {
              calls.push([command, args]);
              if (command === "get_channel_details") return raw(args.channelId);
              if (command === "get_channel_members")
                return {
                  members: [
                    { pubkey: self, role: "member", display_name: "Jacob" },
                    {
                      pubkey: agent,
                      role: "bot",
                      display_name: "Paseo",
                      is_agent: true,
                    },
                  ],
                  next_cursor: nextCursor,
                };
              throw Error(command);
            },
          }
        : s === "@/shared/api/channelMembershipWrites"
          ? { shouldReadChannelMembersFromWriter: () => false }
          : {},
  });
  return {
    io: module.exports,
    calls,
    partial: () => {
      nextCursor = "more";
    },
    open: () => {
      visibility = "open";
    },
  };
}
test("native-detail IPC shape flows through actual API and audience validation into production DM recipient resolution", async () => {
  const h = api(),
    result = await readForwardAudiences(
      "p2",
      "dm",
      self,
      "https://relay.test",
      h.io,
    );
  assert.equal(result.target.channel.memberCount, 2);
  assert.deepEqual(result.target.channel.participantPubkeys, [self, agent]);
  assert.deepEqual(
    messageMentionPubkeys(
      result.target.channel,
      self,
      result.target.members
        .filter((m) => m.pubkey !== self)
        .map((m) => m.pubkey),
    ),
    [agent],
  );
  assert.equal(needsAudienceConfirmation(result), false);
  assert.equal(h.calls.length, 4);
  assert.ok(h.calls.every(([, args]) => args.readYourWrites === true));
  assert.ok(
    h.calls.every(
      ([, args]) =>
        args.expectedRelayUrl === "https://relay.test" &&
        args.expectedSignerPubkey === self,
    ),
  );
  h.open();
  const changed = await readForwardAudiences(
    "p2",
    "dm",
    self,
    "https://relay.test",
    h.io,
  );
  assert.equal(changed.target.channel.visibility, "open");
  assert.equal(needsAudienceConfirmation(changed), true);
});

test("native metadata uses existing strong writer filter with one captured relay/signer", () => {
  const command = fs.readFileSync(
    new URL("../../../src-tauri/src/commands/channels.rs", import.meta.url),
    "utf8",
  );
  const detail = command.slice(
    command.indexOf("pub async fn get_channel_details("),
    command.indexOf("/// Cap for the kind:0"),
  );
  assert.match(
    detail,
    /if read_your_writes.unwrap_or\(false\)\s*\{\s*channel_metadata_filter/,
  );
  assert.match(detail, /assert_expected_relay_scope/);
  assert.match(detail, /assert_expected_signer/);
  assert.equal((detail.match(/query_relay_at_with_keys\(/g) ?? []).length, 1);
  const metadata = command.slice(
    command.indexOf("pub(crate) fn channel_metadata_filter"),
    command.indexOf("async fn fetch_starter_channel_metadata"),
  );
  assert.match(metadata, /"consistency": "strong"/);
});

test("native member/profile reads reuse captured expected relay/signer and keys, never an active-account reread", () => {
  const source = fs.readFileSync(
    new URL("../../../src-tauri/src/commands/channels.rs", import.meta.url),
    "utf8",
  );
  const members = source.slice(
    source.indexOf("pub async fn get_channel_members("),
    source.indexOf("// ── Writes"),
  );
  assert.match(members, /expected_relay_url: Option<String>/);
  assert.match(members, /expected_signer_pubkey: Option<String>/);
  assert.match(members, /assert_expected_relay_scope/);
  assert.match(members, /assert_expected_signer/);
  assert.equal((members.match(/query_relay_at_with_keys\(/g) ?? []).length, 2);
  assert.doesNotMatch(members, /query_relay\(/);
});

test("actual native zero-count/absent-participant projection is preserved; TS owns normalized membership", () => {
  const converter = fs.readFileSync(
    new URL("../../../src-tauri/src/nostr_convert.rs", import.meta.url),
    "utf8",
  );
  const detail = converter.slice(
    converter.indexOf("pub fn channel_detail_from_event("),
    converter.indexOf("pub fn channel_members_from_event("),
  );
  assert.match(detail, /member_count: 0/);
  const models = fs.readFileSync(
    new URL("../../../src-tauri/src/models.rs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    models.slice(
      models.indexOf("pub struct ChannelDetailInfo"),
      models.indexOf("pub struct ChannelMemberInfo"),
    ),
    /participant_pubkeys/,
  );
});

test("forwarding refuses a paginated/partial roster before normalizing any native count hint", async () => {
  const h = api();
  h.partial();
  await assert.rejects(
    readForwardAudiences("p2", "dm", self, "https://relay.test", h.io),
    /complete writer roster/,
  );
});

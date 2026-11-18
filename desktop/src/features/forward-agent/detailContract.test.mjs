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
    member_count: 0, // Actual old native IPC: no participant/member arrays.
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

test("native detail seam joins complete roster and writer metadata; count and required DM arrays are serialized", () => {
  // Source contract checks complement the IPC test; no native compile is claimed.
  const command = fs.readFileSync(
    new URL("../../../src-tauri/src/commands/channels.rs", import.meta.url),
    "utf8",
  );
  const model = fs.readFileSync(
    new URL("../../../src-tauri/src/models.rs", import.meta.url),
    "utf8",
  );
  const convert = fs.readFileSync(
    new URL("../../../src-tauri/src/nostr_convert.rs", import.meta.url),
    "utf8",
  );
  const helper = command.slice(
    command.indexOf("async fn fetch_channel_detail("),
    command.indexOf("/// Cap for the kind:0"),
  );
  assert.match(
    helper,
    /if read_your_writes\s*\{\s*channel_metadata_filter\(&\[channel_id\]\)/,
  );
  assert.match(
    helper,
    /channel_members_filter\(channel_id, read_your_writes\)/,
  );
  assert.match(helper, /channel_members_from_event\(roster_event\)/);
  assert.match(helper, /channel_detail_from_event\(event, &members\)/);
  assert.match(
    helper,
    /let api_base = relay_api_base_url_with_override\(state\)/,
  );
  assert.match(helper, /let keys = state.signing_keys\(\)\?/);
  assert.match(
    helper,
    /assert_expected_relay_scope\(expected_relay_url, &api_base\)/,
  );
  assert.match(
    helper,
    /assert_expected_signer\(expected_signer_pubkey, &keys.public_key\(\).to_hex\(\)\)/,
  );
  assert.equal((helper.match(/query_relay_at_with_keys\(/g) ?? []).length, 2);
  assert.match(
    helper,
    /if !read_your_writes\s*\{\s*return nostr_convert::channel_metadata_detail_from_event\(event\)/,
  );
  const metadata = command.slice(
    command.indexOf("pub(crate) fn channel_metadata_filter"),
    command.indexOf("async fn fetch_starter_channel_metadata"),
  );
  assert.match(metadata, /"consistency": "strong"/);
  const detail = convert.slice(
    convert.indexOf("pub fn channel_detail_from_event("),
    convert.indexOf("pub fn channel_members_from_event("),
  );
  assert.match(detail, /member_count: member_pubkeys.len\(\) as i64/);
  assert.match(detail, /members[\s\S]*\.members[\s\S]*m.pubkey.clone\(\)/);
  for (const field of ["member_pubkeys", "participants", "participant_pubkeys"])
    assert.match(
      model.slice(
        model.indexOf("pub struct ChannelDetailInfo"),
        model.indexOf("pub struct ChannelMemberInfo"),
      ),
      new RegExp(`pub ${field}: Vec<String>`),
    );
  assert.match(detail, /let participant_pubkeys = if channel_type == "dm"/);
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

test("legacy metadata-only reads retain zero count and omit the newly added roster fields", () => {
  const converter = fs.readFileSync(
    new URL("../../../src-tauri/src/nostr_convert.rs", import.meta.url),
    "utf8",
  );
  const legacy = converter.slice(
    converter.indexOf("pub fn channel_metadata_detail_from_event("),
    converter.indexOf(
      "/// Convert a NIP-29 kind:39000 event to [`ChannelDetailInfo`]",
    ),
  );
  assert.match(legacy, /members: Vec::new\(\)/);
  assert.match(legacy, /channel_detail_from_event\(event, &metadata_only\)/);
  const models = fs.readFileSync(
    new URL("../../../src-tauri/src/models.rs", import.meta.url),
    "utf8",
  );
  const detail = models.slice(
    models.indexOf("pub struct ChannelDetailInfo"),
    models.indexOf("pub struct ChannelMemberInfo"),
  );
  assert.equal(
    (detail.match(/skip_serializing_if = "Vec::is_empty"/g) ?? []).length,
    3,
  );
});

test("complete-roster preflight refuses a paginated response from the actual native API boundary", async () => {
  const h = api();
  h.partial();
  await assert.rejects(
    readForwardAudiences("p2", "dm", self, "https://relay.test", h.io),
    /complete writer roster/,
  );
});

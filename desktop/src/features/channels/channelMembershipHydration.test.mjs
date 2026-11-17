import assert from "node:assert/strict";
import test from "node:test";
import {
  isChannelMembershipHydrated,
  markChannelMembershipHydrated,
} from "./channelMembershipHydration.ts";

const scope = {
  communityId: "c",
  relayUrl: "wss://relay",
  identityPubkey: "ABC",
};

test("hydration provenance is client-local and bound to community, relay and identity", () => {
  const client = {},
    other = {};
  assert.equal(isChannelMembershipHydrated(client, scope), false);
  markChannelMembershipHydrated(client, scope);
  assert.equal(isChannelMembershipHydrated(client, scope), true);
  assert.equal(isChannelMembershipHydrated(other, scope), false);
  for (const field of ["communityId", "relayUrl", "identityPubkey"])
    assert.equal(
      isChannelMembershipHydrated(client, { ...scope, [field]: "other" }),
      false,
    );
  assert.equal(
    isChannelMembershipHydrated(client, { ...scope, identityPubkey: "abc" }),
    true,
  );
});

test("later scope validation retires prior admission and empty scopes never authorize", () => {
  const client = {};
  markChannelMembershipHydrated(client, scope);
  const next = { ...scope, communityId: "next" };
  markChannelMembershipHydrated(client, next);
  assert.equal(isChannelMembershipHydrated(client, scope), false);
  assert.equal(isChannelMembershipHydrated(client, next), true);
  assert.equal(
    isChannelMembershipHydrated(client, { ...next, identityPubkey: "" }),
    false,
  );
});

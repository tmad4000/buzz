import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isLongMessageBody,
  messageBodyPreferenceKey,
} from "./messageBodyCollapse.ts";

const community = "community-id";
const viewer = "a1".repeat(32);
const eventId = "b2".repeat(32);

test("default body clamp uses either 12 lines or 800 Unicode characters", () => {
  assert.equal(isLongMessageBody(Array(12).fill("line").join("\n")), false);
  assert.equal(isLongMessageBody(Array(13).fill("line").join("\r\n")), true);
  assert.equal(isLongMessageBody("🐝".repeat(800)), false);
  assert.equal(isLongMessageBody("🐝".repeat(801)), true);
  assert.equal(isLongMessageBody("a".repeat(801)), true);
  assert.equal(isLongMessageBody(""), false);
});

test("preference storage requires a viewer, channel, and delivered event identity", () => {
  const key = messageBodyPreferenceKey(
    community,
    viewer,
    "general-id",
    eventId,
  );
  assert.ok(key);
  assert.notEqual(
    key,
    messageBodyPreferenceKey("other-community", viewer, "general-id", eventId),
  );
  assert.equal(
    messageBodyPreferenceKey(undefined, viewer, "general-id", eventId),
    null,
  );
  assert.equal(
    key,
    messageBodyPreferenceKey(
      community,
      viewer.toUpperCase(),
      "general-id",
      eventId.toUpperCase(),
    ),
  );
  assert.notEqual(
    key,
    messageBodyPreferenceKey(community, "c3".repeat(32), "general-id", eventId),
  );
  assert.notEqual(
    key,
    messageBodyPreferenceKey(community, viewer, "private-id", eventId),
  );
  assert.notEqual(
    key,
    messageBodyPreferenceKey(community, viewer, "general-id", "d4".repeat(32)),
  );
  assert.equal(
    messageBodyPreferenceKey(community, undefined, "general-id", eventId),
    null,
  );
  assert.equal(
    messageBodyPreferenceKey(community, viewer, null, eventId),
    null,
  );
  assert.equal(
    messageBodyPreferenceKey(community, viewer, "general-id", "optimistic:1"),
    null,
  );
});

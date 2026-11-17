import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent } from "nostr-tools/pure";
import {
  captureThreadOrganizerScope,
  JACOB_THREAD_ORGANIZER,
  threadLinkSignerAllowed,
} from "./threadLinkOrganizer.ts";
import { projectThreadLinks } from "./threadLinkProjection.ts";
import { THREAD_LINK_MARKER } from "./threadLinks.ts";

const scope = {
  communityUrl: "https://relay.example",
  channelId: "11111111-2222-4333-8444-555555555555",
};
test("fresh channel roster grants only Jacob, including an owner role, and rejects late scope results", async () => {
  const controller = new AbortController();
  for (const role of ["owner", "member"]) {
    const captured = await captureThreadOrganizerScope(
      scope,
      async (channel, options) => {
        assert.equal(channel, scope.channelId);
        assert.deepEqual(options, { readYourWrites: true });
        return [{ pubkey: JACOB_THREAD_ORGANIZER, role }];
      },
      () => true,
      controller.signal,
    );
    assert.equal(captured.jacobIsChannelMember, true);
  }
  const without = await captureThreadOrganizerScope(
    { ...scope, jacobIsChannelMember: true },
    async () => [{ pubkey: "a".repeat(64), role: "owner" }],
    () => true,
    controller.signal,
  );
  assert.equal(without.jacobIsChannelMember, false);
  await assert.rejects(
    captureThreadOrganizerScope(
      scope,
      async () => [{ pubkey: JACOB_THREAD_ORGANIZER }],
      () => false,
      controller.signal,
    ),
    { name: "AbortError" },
  );
  controller.abort();
  await assert.rejects(
    captureThreadOrganizerScope(
      scope,
      async () => [{ pubkey: JACOB_THREAD_ORGANIZER }],
      () => true,
      controller.signal,
    ),
    { name: "AbortError" },
  );
});
test("organizer policy accepts child authors and only the exact member Jacob key", () => {
  assert.equal(
    JACOB_THREAD_ORGANIZER,
    "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f",
  );
  const childAuthor = "a".repeat(64),
    outsider = "b".repeat(64);
  for (const member of [undefined, false, true]) {
    const captured = { ...scope, jacobIsChannelMember: member };
    assert.equal(
      threadLinkSignerAllowed(childAuthor, childAuthor, captured),
      true,
    );
    assert.equal(
      threadLinkSignerAllowed(outsider, childAuthor, captured),
      false,
    );
    assert.equal(
      threadLinkSignerAllowed(JACOB_THREAD_ORGANIZER, childAuthor, captured),
      member === true,
    );
    assert.equal(
      threadLinkSignerAllowed(
        JACOB_THREAD_ORGANIZER,
        JACOB_THREAD_ORGANIZER,
        captured,
      ),
      true,
    );
  }
});

test("a Jacob-looking but forged envelope cannot bypass fresh signature verification", () => {
  const key = new Uint8Array(32).fill(7);
  const sign = (tags, at = 1) =>
    finalizeEvent(
      {
        kind: 9,
        content: "Synthetic",
        created_at: at,
        tags: [["h", scope.channelId], ...tags],
      },
      key,
    );
  const root = sign([], 1),
    child = sign([], 2);
  const annotation = sign(
    [
      ["t", THREAD_LINK_MARKER],
      ["buzz-thread-op", "link"],
      ["buzz-thread-child", child.id],
      ["buzz-thread-parent", root.id],
      ["buzz-thread-previous", "none"],
    ],
    3,
  );
  const result = projectThreadLinks({
    scope: { ...scope, jacobIsChannelMember: true },
    messages: [root, child],
    annotations: [{ ...annotation, pubkey: JACOB_THREAD_ORGANIZER }],
    historyComplete: true,
  });
  assert.equal(result.heads.size, 0);
  assert.ok(result.decisions.some((decision) => decision.state === "rejected"));
});

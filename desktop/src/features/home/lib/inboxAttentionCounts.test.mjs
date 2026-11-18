import assert from "node:assert/strict";
import { test } from "node:test";
import { buildInboxItems } from "./inbox.ts";
import { withInboxAttentionCounts } from "./inboxAttentionCounts.ts";
const reply = (id, time, pubkey = "agent") => ({
  id,
  kind: 9,
  createdAt: time,
  pubkey,
  content: "reply",
  channelId: "channel",
  channelType: "stream",
  category: "activity",
  tags: [
    ["h", "channel"],
    ["e", "root", "", "root"],
    ["e", "root", "", "reply"],
  ],
});
function items() {
  const a = reply("old", 10),
    b = reply("new", 20),
    own = reply("own", 30, "me");
  return buildInboxItems({
    currentPubkey: "me",
    feed: {
      feed: {
        activity: [a, b, own],
        mentions: [b],
        needsAction: [],
        agentActivity: [],
      },
      meta: { since: 0, total: 3, generatedAt: 30 },
    },
    getMessageReadAt: () => null,
  });
}
test("canonical Inbox progress and exact observed replies stay independent; duplicate feed categories count once", () => {
  const source = items();
  const [item] = withInboxAttentionCounts(
    source,
    "me",
    (_root, id) => (id === "new" ? 20 : null),
    true,
  );
  assert.equal(item.attentionCounts.newSinceRead, source[0].unreadCount);
  assert.equal(item.attentionCounts.unseenReplies, 1);
  assert.equal(item.attentionCounts.coverage, "loaded");
  assert.equal(source[0].attentionCounts, undefined);
  assert.equal(
    withInboxAttentionCounts(source, "me", () => null, true)[0].attentionCounts
      .unseenReplies,
    2,
  );
});
test("unknown hydration or identity is not caught up", () => {
  assert.equal(
    withInboxAttentionCounts(items(), "me", () => 99, false)[0].attentionCounts
      .unseenReplies,
    null,
  );
  assert.equal(
    withInboxAttentionCounts(items(), undefined, () => 99, true)[0]
      .attentionCounts.unseenReplies,
    null,
  );
});
test("new-since-read uses the existing Home progress selector, separately from exact body observation", () => {
  const [item] = withInboxAttentionCounts(items(), "me", () => null, true, {
    getChannelReadAt: () => 99,
    getThreadReadAt: () => 15,
    getMessageReadAt: () => null,
    seenFeedIdSet: new Set(),
  });
  assert.equal(item.attentionCounts.newSinceRead, 2);
  assert.equal(item.attentionCounts.unseenReplies, 2);
  const source = items();
  source[0].groupItems = source[0].groupItems.map((event) => ({
    ...event,
    tags: [["h", "channel"]],
  }));
  const [channel] = withInboxAttentionCounts(source, "me", () => null, true, {
    getChannelReadAt: () => 25,
    getThreadReadAt: () => null,
    seenFeedIdSet: new Set(),
  });
  assert.equal(channel.attentionCounts.newSinceRead, 1);
  assert.equal(channel.attentionCounts.unseenReplies, 0);
});

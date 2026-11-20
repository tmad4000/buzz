import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeSidebarUnreadBadge,
  getSidebarUnreadMentionChannelIds,
} from "./sidebarUnreadBadge.ts";

const unread = {
  evidence: undefined,
  hasUnread: true,
  hasMention: false,
  suppressed: false,
};

test("shows a numeral only for known coverage and caps it at 99+", () => {
  assert.deepEqual(
    describeSidebarUnreadBadge({
      ...unread,
      evidence: { count: 1, coverage: "exact" },
    }),
    { text: "1", label: "1 unread message" },
  );
  assert.deepEqual(
    describeSidebarUnreadBadge({
      ...unread,
      evidence: { count: 100, coverage: "exact" },
    }),
    { text: "99+", label: "100 unread messages" },
  );
});

test("distinguishes a lower bound, presence only, and no unread evidence", () => {
  assert.deepEqual(
    describeSidebarUnreadBadge({
      ...unread,
      evidence: { count: 1, coverage: "partial" },
    }),
    { text: "1+", label: "At least 1 unread message" },
  );
  assert.deepEqual(
    describeSidebarUnreadBadge({
      ...unread,
      evidence: { count: 200, coverage: "partial" },
      hasMention: true,
    }),
    { text: "99+", label: "At least 200 unread messages, including a mention" },
  );
  assert.deepEqual(describeSidebarUnreadBadge(unread), {
    text: null,
    label: "Unread messages",
  });
  assert.equal(
    describeSidebarUnreadBadge({ ...unread, hasUnread: false }),
    null,
  );
});

test("suppression takes precedence over counts and mentions", () => {
  assert.equal(
    describeSidebarUnreadBadge({
      ...unread,
      evidence: { count: 8, coverage: "partial" },
      hasMention: true,
      suppressed: true,
    }),
    null,
  );
});

const reader = "a".repeat(64);
const author = "b".repeat(64);
const root = "c".repeat(64);
const mention = {
  id: "mention",
  channelId: "channel",
  pubkey: author,
  createdAt: 20,
  tags: [["p", reader]],
};
const mentionInputs = {
  mentions: [mention],
  pubkey: reader,
  unreadIds: new Set(),
  doneIds: new Set(),
  getChannelReadAt: () => null,
  getOwnReadAt: () => null,
};

test("only signed direct mentions of the reader can highlight a row", () => {
  const mentioned = getSidebarUnreadMentionChannelIds({
    ...mentionInputs,
    mentions: [
      mention,
      { ...mention, channelId: "own", pubkey: reader },
      { ...mention, channelId: "broadcast", tags: [["broadcast", "1"]] },
      { ...mention, channelId: "other", tags: [["p", author]] },
    ],
  });
  assert.deepEqual(mentioned, new Set(["channel"]));
});

test("mention highlight follows read markers and explicit Inbox state", () => {
  const marked = {
    ...mentionInputs,
    mentions: [
      {
        ...mention,
        tags: [
          ...mention.tags,
          ["e", root, "", "root"],
          ["e", root, "", "reply"],
        ],
      },
    ],
  };
  for (const readAt of [
    { getChannelReadAt: () => 20 },
    { getOwnReadAt: (id) => (id === "msg:mention" ? 20 : null) },
    { getOwnReadAt: (id) => (id === `thread:${root}` ? 20 : null) },
    { doneIds: new Set(["mention"]) },
  ]) {
    assert.deepEqual(
      getSidebarUnreadMentionChannelIds({ ...marked, ...readAt }),
      new Set(),
    );
  }
  assert.deepEqual(
    getSidebarUnreadMentionChannelIds({
      ...marked,
      getChannelReadAt: () => 20,
      unreadIds: new Set(["mention"]),
    }),
    new Set(["channel"]),
  );
});

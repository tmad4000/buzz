import assert from "node:assert/strict";
import { test } from "node:test";
import { MessageRowItem } from "./TimelineMessageRow.tsx";

for (const summary of [
  null,
  { threadHeadId: "root", replyCount: 2, lastReplyAt: 1, participants: [] },
]) {
  test(`inline summary preserves matching text and active search highlight (${summary ? "existing replies" : "first reply"})`, () => {
    const base = {
      entry: {
        message: {
          id: "root",
          body: "Searchable release plan",
          author: "Alex",
          createdAt: 1,
          depth: 0,
        },
        summary,
      },
      footer: null,
      onOpenThread: () => {},
      renderThreadSummary: () => null,
      videoReviewContext: null,
      searchQuery: "release",
      searchMatchingMessageIds: new Set(["root"]),
      searchActiveMessageId: "root",
    };
    const rendered = MessageRowItem(base);
    const row = rendered.props.children[0];
    assert.equal(row.props.searchQuery, "release");
    assert.match(rendered.props.className, /before:bg-primary/);
    const unmatched = MessageRowItem({
      ...base,
      searchMatchingMessageIds: new Set(),
      searchActiveMessageId: null,
    });
    assert.equal(unmatched.props.children[0].props.searchQuery, undefined);
    assert.doesNotMatch(unmatched.props.className, /before:bg-primary/);
  });
}

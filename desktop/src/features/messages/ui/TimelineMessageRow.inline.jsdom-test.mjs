import assert from "node:assert/strict";
import { test } from "node:test";
import { registerHooks } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
// Keep the production wrapper and React lifecycle; capture only the unrelated
// leaf row props that this search-forwarding contract has always asserted.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "./MessageRow" &&
      context.parentURL?.endsWith("/TimelineMessageRow.tsx")
      ? { shortCircuit: true, url: "inline-search-fixture:MessageRow" }
      : nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    return url === "inline-search-fixture:MessageRow"
      ? {
          shortCircuit: true,
          format: "module",
          source:
            "export function MessageRow(props) { globalThis.__inlineSearchRowProps = props; return null; }",
        }
      : nextLoad(url, context);
  },
});
const { MessageRowItem } = await import("./TimelineMessageRow.tsx");

for (const summary of [
  null,
  { threadHeadId: "root", replyCount: 2, lastReplyAt: 1, participants: [] },
]) {
  test(`inline summary preserves matching text and active search highlight (${summary ? "existing replies" : "first reply"})`, async () => {
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
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(React.createElement(MessageRowItem, base)),
      );
      assert.equal(globalThis.__inlineSearchRowProps.searchQuery, "release");
      assert.match(host.firstElementChild.className, /before:bg-primary/);
      await act(async () =>
        root.render(
          React.createElement(MessageRowItem, {
            ...base,
            searchMatchingMessageIds: new Set(),
            searchActiveMessageId: null,
          }),
        ),
      );
      assert.equal(globalThis.__inlineSearchRowProps.searchQuery, undefined);
      assert.doesNotMatch(
        host.firstElementChild.className,
        /before:bg-primary/,
      );
    } finally {
      await act(async () => root.unmount());
      host.remove();
      delete globalThis.__inlineSearchRowProps;
    }
  });
}

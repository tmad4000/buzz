import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

// The production wrapper chooses two child layouts around the real row. Replace
// only unrelated leaf UI so this test observes React's actual reconciliation.
const source = ts.createSourceFile(
  "TimelineMessageRow.tsx",
  readFileSync(new URL("./TimelineMessageRow.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let declaration;
ts.forEachChild(source, (node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "MessageRowItem")
    declaration = node;
});
assert.ok(declaration);
const code = ts.transpile(
  declaration.getText(source).replace(/^export\s+/, ""),
  { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
);
let mounts = 0;
function LeafRow({ message }) {
  React.useEffect(() => {
    mounts++;
  }, []);
  return React.createElement(
    "article",
    { "data-message-id": message.id },
    React.createElement("button", { type: "button" }, "Reply"),
  );
}
const Row = new Function(
  "React",
  "useTimelineView",
  "useVisibleThreadReplies",
  "canManageMessageForCurrentUser",
  "cn",
  "MessageRow",
  "TimelineReplyChip",
  "MessageThreadSummaryRow",
  "THREAD_REPLY_ROW_MARGIN_INLINE_REM",
  `${code};return MessageRowItem;`,
)(
  React,
  () => ({ mode: "channels" }),
  () => {},
  () => false,
  (...values) => values.filter(Boolean).join(" "),
  LeafRow,
  () => null,
  () => null,
  0,
);

test("pending to accepted summary preserves the same row DOM and focused Reply", async () => {
  mounts = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    entry: {
      message: {
        id: "outbox-local:uuid",
        renderKey: "outbox-local:uuid",
        pending: true,
        body: "retained",
        createdAt: 1,
        depth: 0,
      },
      summary: null,
    },
    renderThreadSummary: () => null,
    onOpenThread: () => {},
  };
  try {
    await act(async () => root.render(React.createElement(Row, props)));
    const row = host.querySelector("article");
    const reply = row.querySelector("button");
    reply.focus();
    await act(async () =>
      root.render(
        React.createElement(Row, {
          ...props,
          entry: {
            ...props.entry,
            message: {
              ...props.entry.message,
              id: "a".repeat(64),
              pending: false,
            },
          },
        }),
      ),
    );
    assert.equal(
      host.querySelector("article") === row,
      true,
      "ACK must retain the exact message row node",
    );
    assert.equal(row.dataset.messageId, "a".repeat(64));
    assert.equal(
      document.activeElement === reply,
      true,
      "ACK must retain focus on the original Reply button",
    );
    assert.equal(mounts, 1);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

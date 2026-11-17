import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useVisibleThreadReplies } from "./useVisibleThreadReplies.ts";
import { ConversationViewContext } from "@/features/conversations/ConversationViewContext";
test("read acknowledgements require exposed committed rows, deduplicate, and reject detached/stale scope callbacks", async () => {
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const previous = globalThis.IntersectionObserver;
  const observers = [];
  globalThis.IntersectionObserver = class {
    nodes = [];
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      this.nodes.push(node);
    }
    disconnect() {
      this.disconnected = true;
    }
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const calls = [];
  const messages = [
    { id: "visible", createdAt: 1 },
    { id: "hidden", createdAt: 1 },
    { id: "pending", createdAt: 1, pending: true },
  ];
  const reveal = (rows, rootId) => calls.push([rows.map((m) => m.id), rootId]);
  function Harness({ scope = "one", show = true }) {
    const ref = React.useRef(null);
    useVisibleThreadReplies(ref, messages, reveal, "root", scope);
    return React.createElement(
      "section",
      { ref },
      show
        ? messages.map((m) =>
            React.createElement(
              "article",
              {
                key: m.id,
                "data-testid": "message-row",
                "data-message-id": m.id,
              },
              React.createElement(
                "div",
                { "data-testid": "message-body" },
                "body",
              ),
            ),
          )
        : null,
    );
  }
  try {
    await act(() => root.render(React.createElement(Harness, {})));
    const first = observers.at(-1);
    assert.equal(first.nodes.length, 2, "pending rows are not observed");
    for (const node of first.nodes) node.getClientRects = () => [{}];
    first.callback(
      first.nodes.map((target) => ({ target, isIntersecting: false })),
    );
    assert.equal(calls.length, 0, "mounted alone is not read");
    first.callback([{ target: first.nodes[0], isIntersecting: true }]);
    assert.deepEqual(calls, [[["visible"], "root"]]);
    first.callback([{ target: first.nodes[0], isIntersecting: true }]);
    assert.equal(calls.length, 1);
    await act(() => root.render(React.createElement(Harness, { show: false })));
    first.callback([{ target: first.nodes[1], isIntersecting: true }]);
    assert.equal(calls.length, 1, "removed descendants stay unread");
    await act(() =>
      root.render(React.createElement(Harness, { scope: "two" })),
    );
    first.callback([{ target: first.nodes[1], isIntersecting: true }]);
    assert.equal(calls.length, 1, "old scope callback is ignored");
    const next = observers.at(-1);
    for (const node of next.nodes) node.getClientRects = () => [{}];
    next.callback([{ target: next.nodes[0], isIntersecting: true }]);
    assert.equal(
      calls.length,
      2,
      "new identity scope has independent visibility",
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
    globalThis.IntersectionObserver = previous;
  }
});

test("only intersecting reply bodies in the foreground are observed, with re-entry after focus", async () => {
  document.hasFocus = () => true;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const observers = [];
  globalThis.IntersectionObserver = class {
    nodes = [];
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      this.nodes.push(node);
    }
    disconnect() {}
  };
  const writes = [];
  const onReveal = (rows) => writes.push(rows.map((x) => x.id));
  const messages = [{ id: "reply", createdAt: 20 }];
  function Host({ focused, viewId = "test" }) {
    return React.createElement(
      ConversationViewContext.Provider,
      { value: { viewInstanceId: viewId, focused, visible: true } },
      React.createElement(Rows),
    );
  }
  function Rows() {
    const ref = React.useRef(null);
    useVisibleThreadReplies(ref, messages, onReveal, "root", "scope");
    return React.createElement(
      "div",
      { ref },
      React.createElement(
        "div",
        { "data-testid": "message-row", "data-message-id": "reply" },
        React.createElement(
          "div",
          { "data-testid": "message-body" },
          "reply body",
        ),
      ),
    );
  }
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(React.createElement(Host, { focused: true })),
  );
  let observer = observers.at(-1);
  assert.equal(observer.nodes.length, 1);
  const body = observer.nodes[0];
  assert.equal(body.dataset.testid, "message-body");
  body.getClientRects = () => [{ width: 100, height: 40 }];
  await act(async () =>
    observer.callback([{ target: body, isIntersecting: false }]),
  );
  assert.equal(writes.length, 0);
  await act(async () =>
    root.render(React.createElement(Host, { focused: false })),
  );
  await act(async () =>
    observer.callback([{ target: body, isIntersecting: true }]),
  );
  assert.equal(writes.length, 0);
  await act(async () =>
    root.render(React.createElement(Host, { focused: true })),
  );
  observer = observers.at(-1);
  await act(async () =>
    observer.callback([{ target: body, isIntersecting: true }]),
  );
  assert.deepEqual(writes, [["reply"]]);
  await act(async () =>
    observer.callback([{ target: body, isIntersecting: true }]),
  );
  assert.equal(writes.length, 1);
  const retired = observer;
  await act(async () =>
    root.render(
      React.createElement(Host, { focused: true, viewId: "replacement-view" }),
    ),
  );
  await act(async () =>
    retired.callback([{ target: body, isIntersecting: true }]),
  );
  assert.equal(
    writes.length,
    1,
    "same canonical reply rejects retired view callbacks",
  );
  observer = observers.at(-1);
  await act(async () =>
    observer.callback([{ target: body, isIntersecting: true }]),
  );
  assert.equal(
    writes.length,
    2,
    "replacement view has its own observation lifecycle",
  );
  await act(async () => root.unmount());
  container.remove();
});

import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  InlineAutoExpansionProvider,
  useInlineAutoExpansion,
} from "./InlineAutoExpansion.tsx";
test("quick answers bypass the three compact-root budget; grants are ranked and survive root eviction", async () => {
  localStorage.clear();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  let current;
  function Consumer({ candidates }) {
    const view = useInlineAutoExpansion();
    current = view;
    React.useLayoutEffect(() => {
      for (const candidate of candidates) view.register(candidate);
    }, [candidates, view.register]);
    return null;
  }
  const compact = [1, 4, 2, 3].map((lastAt, i) => ({
    id: `c${i}`,
    kind: "compact",
    ready: false,
    lastAt,
  }));
  const answers = [0, 1, 2, 3].map((i) => ({
    id: `q${i}`,
    kind: "answer",
    ready: true,
    lastAt: 1,
  }));
  const render = async (candidates, scope = "one") =>
    act(() =>
      root.render(
        React.createElement(
          React.StrictMode,
          null,
          React.createElement(
            InlineAutoExpansionProvider,
            { key: scope, scope, currentPubkey: "me" },
            React.createElement(Consumer, { candidates }),
          ),
        ),
      ),
    );
  try {
    await render([...compact, ...answers]);
    assert.equal(
      current.opened.size,
      4,
      "Q&A opens while other classifications are pending",
    );
    await render([...compact.map((c) => ({ ...c, ready: true })), ...answers]);
    assert.deepEqual(
      [...current.opened].filter((id) => id.startsWith("c")).sort(),
      ["c1", "c2", "c3"],
    );
    assert.equal(current.opened.size, 7);
    await act(() => current.remove("q0"));
    assert.ok(
      current.opened.has("q0"),
      "virtualizer eviction does not erase this visit's choice",
    );
    await render([
      { id: "later", kind: "compact", ready: true, lastAt: 100 },
      ...answers,
    ]);
    assert.equal(
      current.opened.has("later"),
      false,
      "no fourth compact automatic root",
    );
    await render([], "other-entry");
    assert.equal(current.opened.size, 0);
    assert.equal(current.policy.channels, "smart");
    assert.equal(current.policy.replies, "smart");
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

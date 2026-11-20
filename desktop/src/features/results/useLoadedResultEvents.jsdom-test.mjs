import assert from "node:assert/strict";
import { test } from "node:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { useLoadedResultEvents } from "./useLoadedResultEvents.ts";

test("Results reads only loaded channel and reader-scoped cache entries", async () => {
  const cache = new QueryClient();
  const container = document.createElement("div");
  const root = createRoot(container);
  const thread = ["thread-replies", "channel-a", "thread-a"];
  const evidence = [
    "unseen-reply-evidence",
    "channel-a",
    "reader-a",
    "thread-b",
  ];
  cache.setQueryData(thread, [{ id: "thread result" }]);
  cache.setQueryData(evidence, [{ id: "evidence result" }]);
  cache.setQueryData(
    ["unseen-reply-evidence", "channel-a", "reader-b"],
    [{ id: "foreign reader" }],
  );
  cache.setQueryData(
    ["thread-replies", "channel-b", "thread-a"],
    [{ id: "foreign channel" }],
  );
  function Probe({ channel }) {
    const events = useLoadedResultEvents(channel, "reader-a");
    return createElement(
      "output",
      null,
      events
        .flat()
        .map(({ id }) => id)
        .join(","),
    );
  }
  const render = (channel) =>
    act(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: cache },
          createElement(Probe, { channel }),
        ),
      ),
    );
  try {
    await render("channel-a");
    assert.equal(container.textContent, "thread result,evidence result");
    assert.equal(cache.isFetching(), 0);
    await act(() => cache.removeQueries({ queryKey: thread }));
    assert.equal(container.textContent, "evidence result");
    await render(null);
    assert.equal(container.textContent, "");
  } finally {
    await act(() => root.unmount());
    cache.clear();
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useReadState } from "./useReadState.ts";
import { buildContextParents } from "./contextParentRegistry.ts";

// A background cached host changes only graph evidence, never read markers.
test("register and release invalidate memoized effective read projections without marking read", async () => {
  const publishes = [];
  const relay = {
    fetchEvents: async () => [],
    publishEvent: async (...args) => publishes.push(args),
    subscribeInteractive: () => () => {},
  };
  const parents = buildContextParents("general", [
    { id: "reply", tags: [["h", "general"]] },
  ]);
  let readState;
  let setMounted;
  let projected;
  function Evidence({ register }) {
    React.useLayoutEffect(() => register(parents), [register]);
    return null;
  }
  function Harness() {
    readState = useReadState("a".repeat(64), relay);
    const [mounted, setValue] = React.useState(false);
    setMounted = setValue;
    // Mirrors production badge memos: stable getter, explicit version trigger.
    // biome-ignore lint/correctness/useExhaustiveDependencies: readStateVersion is the production invalidation trigger.
    projected = React.useMemo(
      () => readState.getEffectiveTimestamp("msg:reply"),
      [readState.getEffectiveTimestamp, readState.readStateVersion],
    );
    return mounted
      ? React.createElement(Evidence, {
          register: readState.registerContextParents,
        })
      : null;
  }
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await act(async () =>
      readState.seedContextRead("general", Math.floor(Date.now() / 1000)),
    );
    const frontier = readState.getEffectiveTimestamp("general");
    assert.ok(frontier > 0);
    assert.equal(projected, null);
    await act(async () => setMounted(true));
    assert.equal(projected, frontier);
    await act(async () => setMounted(false));
    assert.equal(projected, null);
    assert.deepEqual(publishes, []);
  } finally {
    await act(() => root.unmount());
  }
});

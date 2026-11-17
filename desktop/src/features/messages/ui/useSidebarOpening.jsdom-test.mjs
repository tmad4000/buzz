import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useSidebarOpening } from "./useSidebarOpening.ts";
import { useUnreadSidebarThread } from "./useUnreadSidebarThread.ts";
import { threadExpansionKey } from "../lib/threadExpansionStorage.ts";
const msg = (id, at, parentId = "root", pubkey = "other") => ({
  id,
  createdAt: at,
  parentId,
  rootId: "root",
  pubkey,
  body: id,
  author: pubkey,
  time: "now",
  depth: 0,
});
const root = msg("root", 0, null);
let latest;
function Probe(p) {
  const opening = useSidebarOpening({
    enabled: true,
    scope: p.scope ?? "visit",
    root: "root",
    reader: "me",
    messages: p.messages,
    ready: p.ready ?? true,
    complete: p.complete ?? true,
    seenAt: p.seenAt,
    explicitTarget: p.target ?? null,
  });
  const thread = useUnreadSidebarThread({
    enabled: true,
    visitOnly: true,
    freshRevealIds: opening.fresh,
    channelId: "opening",
    currentPubkey: "me",
    root: "root",
    messages: p.messages,
    initialMode: "collapsed",
    scrollTargetId: p.target ?? null,
  });
  latest = { opening, thread, projection: opening.project(thread.entries) };
  return React.createElement(
    "div",
    null,
    latest.projection.entries.map((e) =>
      React.createElement("span", { key: e.message.id }, e.message.id),
    ),
  );
}
function mount() {
  const node = document.createElement("div");
  document.body.append(node);
  const tree = createRoot(node);
  return {
    render: (p) => act(() => tree.render(React.createElement(Probe, p))),
    close: () =>
      act(() => {
        tree.unmount();
        node.remove();
      }),
  };
}
const bodies = () =>
  (latest.thread.expanded.has("root") ? latest.projection.entries : [])
    .filter((e) => !latest.projection.runs.has(e.message.id))
    .map((e) => e.message.id);
test("new sidebar visit ignores legacy collapse; required >8 paths and own replies bypass budget; manual fold, new unseen, read transition and reopen", async () => {
  localStorage.clear();
  const key = threadExpansionKey(null, "me", "opening", "root");
  localStorage.setItem(key, JSON.stringify([["root", false]]));
  const messages = [root];
  const unseen = new Set();
  for (let i = 0; i < 12; i++) {
    messages.push(msg(`branch${i}`, i * 3 + 1));
    messages.push(msg(`leaf${i}`, i * 3 + 2, `branch${i}`));
    unseen.add(`leaf${i}`);
  }
  messages.push(msg("own", 39, "branch5", "me"));
  messages.push(msg("latest", 40));
  const seenAt = (_r, id) => (unseen.has(id) ? null : 100);
  const app = mount();
  await app.render({ messages, seenAt });
  for (let i = 0; i < 12; i++) {
    assert.ok(bodies().includes(`branch${i}`));
    assert.ok(bodies().includes(`leaf${i}`));
  }
  assert.ok(bodies().includes("own"));
  assert.ok(bodies().includes("latest"));
  assert.equal(latest.opening.openingTarget, "leaf0");
  assert.equal(
    JSON.parse(localStorage.getItem(key))[0][1],
    false,
    "sidebar never rewrites shared inline preferences",
  );
  await act(() => latest.thread.setExpanded("root", false));
  await app.render({ messages, seenAt: () => 100 });
  assert.deepEqual(
    bodies(),
    [],
    "seen transitions do not undo a manual current-visit fold",
  );
  const newer = [...messages, msg("incoming", 41, "branch10")];
  await app.render({
    messages: newer,
    seenAt: (_r, id) => (id === "incoming" ? null : 100),
  });
  assert.ok(
    bodies().includes("incoming"),
    "new unseen arrival reveals ancestors once",
  );
  await act(() => latest.thread.setExpanded("root", false));
  await app.render({ messages: newer, seenAt: () => 100 });
  assert.deepEqual(bodies(), []);
  await app.close();
  const reopened = mount();
  await reopened.render({ messages: newer, seenAt: () => 100 });
  assert.ok(bodies().includes("incoming"));
  assert.ok(bodies().includes("branch0"));
  await reopened.close();
});
test("only contiguous positively seen older runs fold; reveal/read/latest transitions latch; explicit target beats unseen; unknown/partial does not fold or position", async () => {
  const messages = [
    root,
    ...Array.from({ length: 7 }, (_, i) => msg(`m${i + 1}`, i + 1)),
  ];
  const seenAt = (_r, id) => (id === "m4" ? null : 100);
  const app = mount();
  await app.render({
    messages: [root, messages.at(-1)],
    seenAt,
    ready: false,
    complete: false,
  });
  assert.equal(latest.projection.runs.size, 0);
  assert.equal(latest.opening.openingTarget, null);
  await app.render({ messages, seenAt, ready: true, complete: false });
  assert.equal(latest.projection.runs.size, 0);
  assert.equal(latest.opening.openingTarget, null);
  await app.render({ messages, seenAt, target: "m3" });
  assert.equal(latest.opening.openingTarget, "m3");
  assert.ok(bodies().includes("m3"));
  const runs = [...latest.projection.runs.values()];
  assert.deepEqual(
    runs.map((r) => r.ids),
    [["m2"], ["m5", "m6"]],
  );
  await act(() => latest.opening.showRun(runs[1]));
  assert.ok(bodies().includes("m5"));
  await act(() => latest.opening.retain("m5"));
  await act(() => latest.opening.hideRun(runs[1]));
  assert.ok(
    !bodies().includes("m5"),
    "explicit run hide wins over prior focus retention",
  );
  await app.render({
    messages: [...messages, msg("m8", 8)],
    seenAt: () => 100,
  });
  assert.ok(
    bodies().includes("m4"),
    "observing an unseen body cannot recollapse it",
  );
  assert.ok(bodies().includes("m7"), "former latest remains visible");
  assert.ok(bodies().includes("m8"));
  await app.close();
});

test("explicit positioning completes the visit and pending target identity survives acknowledgement", async () => {
  const app = mount();
  const messages = [
    root,
    msg("unseen", 1),
    {
      ...msg("pending", 2, "root", "me"),
      pending: true,
      renderKey: "local-send",
    },
  ];
  await app.render({ messages, seenAt: () => null });
  assert.equal(latest.opening.openingTarget, "unseen");
  await app.render({ messages, seenAt: () => null, target: "pending" });
  await act(() => latest.opening.positionDone());
  await app.render({ messages, seenAt: () => null });
  assert.equal(
    latest.opening.openingTarget,
    null,
    "clearing explicit target cannot cause fallback jump",
  );
  await app.close();
  const own = mount();
  await own.render({ messages: [root, messages[2]], seenAt: () => null });
  assert.equal(latest.opening.openingTarget, "pending");
  await own.render({
    messages: [root, { ...messages[2], id: "accepted", pending: false }],
    seenAt: () => null,
  });
  assert.equal(latest.opening.openingTarget, "accepted");
  await own.close();
});

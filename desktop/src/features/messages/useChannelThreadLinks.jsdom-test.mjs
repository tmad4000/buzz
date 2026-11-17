import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChannelThreadLinks } from "./useChannelThreadLinks.ts";
import {
  ThreadOrganizationContext,
  ThreadOrganizationBadge,
  ThreadOrganizationNotice,
} from "./ui/ThreadOrganization.tsx";

const one = {
  communityUrl: "https://relay.example",
  channelId: "11111111-2222-4333-8444-555555555555",
};
const two = { ...one, channelId: "22222222-2222-4333-8444-555555555555" };
const snapshot = (scope) => ({
  events: [],
  annotations: [],
  parsedAnnotations: [],
  canonicalRoots: [],
  projection: {
    scope,
    status: "complete",
    messages: new Map(),
    heads: new Map(),
    decisions: [],
    issues: [],
  },
});
let latest;
function Harness({ scope, identity = "alice", api }) {
  latest = useChannelThreadLinks(
    scope,
    JSON.stringify([scope, identity]),
    identity,
    api,
  );
  return React.createElement(
    ThreadOrganizationContext.Provider,
    { value: latest },
    React.createElement(ThreadOrganizationNotice),
  );
}
function mount() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    render: (props) =>
      act(async () => root.render(React.createElement(Harness, props))),
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

test("mounted production hook subscribes before history and fences stale channel/identity completion", async () => {
  localStorage.clear();
  const calls = [],
    waiting = [],
    subscriptions = [];
  const api = {
    subscribe: async (channel, callback) => {
      const entry = { channel, callback, closed: false };
      subscriptions.push(entry);
      calls.push(`subscribe:${channel}`);
      return () => {
        entry.closed = true;
      };
    },
    reconnect: () => () => {},
    revoke: () => () => {},
    load: (scope, signal, current) => {
      calls.push(`load:${scope.channelId}`);
      return new Promise((resolve) =>
        waiting.push({ scope, signal, current, resolve }),
      );
    },
  };
  const app = mount();
  await app.render({ scope: one, api });
  await flush();
  assert.equal(calls[0], `subscribe:${one.channelId}`);
  assert.equal(waiting.length, 1);
  await app.render({ scope: two, api });
  await flush();
  assert.equal(waiting[0].signal.aborted, true);
  assert.equal(waiting[0].current(), false);
  assert.equal(subscriptions[0].closed, true);
  await act(async () => waiting[0].resolve(snapshot(one)));
  assert.equal(latest.snapshot, null);
  await act(async () => waiting[1].resolve(snapshot(two)));
  assert.equal(latest.snapshot.projection.scope.channelId, two.channelId);
  await app.render({ scope: two, identity: "other", api });
  await flush();
  assert.equal(
    latest.snapshot,
    null,
    "same channel cannot reuse another identity's union",
  );
  await app.close();
});

test("failed union shows native fallback; live annotations and reconnects invalidate old view before retry", async () => {
  let live,
    reconnect,
    revoke,
    fail = false;
  const api = {
    subscribe: async (_, cb) => {
      live = cb;
      return () => {};
    },
    reconnect: (cb) => {
      reconnect = cb;
      return () => {};
    },
    revoke: (cb) => {
      revoke = cb;
      return () => {};
    },
    load: async (scope) => {
      if (fail) throw Error("offline");
      return snapshot(scope);
    },
  };
  const app = mount();
  await app.render({ scope: one, api });
  await flush();
  assert.ok(latest.snapshot);
  fail = true;
  await act(async () =>
    live({ kind: 9, tags: [["t", "buzz-thread-link-v1"]] }),
  );
  assert.equal(latest.snapshot, null);
  assert.match(app.container.textContent, /original positions/i);
  fail = false;
  await act(async () => reconnect());
  assert.ok(latest.snapshot);
  fail = true;
  await act(async () => revoke());
  assert.equal(latest.snapshot, null);
  await app.close();
});

test("production audit badge exposes original IDs, only authors see undo; pending receipts are truthful", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const message = {
    id: "c".repeat(64),
    threadOrganization: {
      annotationId: "a".repeat(64),
      organizerPubkey: "alice",
      canonicalParentId: null,
      canonicalRootId: null,
      operation: "link",
    },
  };
  let writes = 0;
  const view = {
    identity: "other",
    undoBusy: false,
    undo: async () => writes++,
    pending: [],
    loading: false,
    error: null,
    undoError: null,
    snapshot: null,
    refresh: () => {},
  };
  const render = async (context) =>
    act(async () =>
      root.render(
        React.createElement(
          ThreadOrganizationContext.Provider,
          { value: context },
          React.createElement(ThreadOrganizationBadge, { message }),
          React.createElement(ThreadOrganizationNotice),
        ),
      ),
    );
  await render(view);
  await act(async () => container.querySelector("button").click());
  assert.match(document.body.textContent, /Channel top level/);
  assert.match(document.body.textContent, new RegExp(message.id));
  assert.equal(
    document.querySelector('[data-testid="thread-organization-audit"] button'),
    null,
  );
  await render({ ...view, identity: "alice" });
  await act(async () =>
    document
      .querySelector('[data-testid="thread-organization-audit"] button')
      .click(),
  );
  assert.equal(writes, 1);
  await render({
    ...view,
    pending: [
      {
        event: { id: "f".repeat(64) },
        childId: message.id,
        previousId: "a".repeat(64),
      },
    ],
  });
  assert.match(container.textContent, /Undo pending verification/);
  assert.doesNotMatch(container.textContent, /task|done|completed/i);
  await act(async () => root.unmount());
  container.remove();
});

test("known invalid controls stay ordinary through failed refresh; a later selected verdict removes that eligibility", async () => {
  let fail = false,
    live,
    selected = false;
  const id = "f".repeat(64);
  const api = {
    subscribe: async (_, callback) => {
      live = callback;
      return () => {};
    },
    reconnect: () => () => {},
    revoke: () => () => {},
    load: async (scope) => {
      if (fail) throw Error("offline");
      const result = snapshot(scope);
      result.projection.decisions = [
        {
          annotationId: id,
          childId: "c".repeat(64),
          state: selected ? "selected" : "rejected",
          reason: selected ? "author-link" : "unavailable-child",
        },
      ];
      return result;
    },
  };
  const app = mount();
  await app.render({ scope: one, api });
  await flush();
  assert.ok(latest.rejectedIds.has(id));
  fail = true;
  await act(async () =>
    live({ kind: 9, tags: [["t", "buzz-thread-link-v1"]] }),
  );
  assert.ok(
    latest.rejectedIds.has(id),
    "failed refresh cannot hide known ordinary content",
  );
  fail = false;
  selected = true;
  await act(async () => latest.refresh());
  assert.equal(
    latest.rejectedIds.has(id),
    false,
    "recovered source makes an accepted receipt metadata again",
  );
  await app.close();
});

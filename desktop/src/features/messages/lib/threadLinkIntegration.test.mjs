import assert from "node:assert/strict";
import test from "node:test";
import { finalizeEvent, verifyEvent } from "nostr-tools/pure";
import {
  loadThreadLinkSnapshot,
  fetchThreadLinkPages,
} from "./threadLinkLoader.ts";
import { runThreadLinkWork } from "./threadLinkWorker.ts";
import {
  applyThreadLinkPresentation,
  threadLinkRelaySummaries,
} from "./applyThreadLinkPresentation.ts";
import { formatTimelineMessages } from "./formatTimelineMessages.ts";
import { buildThreadPanelData } from "./threadPanel.ts";
import {
  buildReplyTags,
  getThreadReference,
  resolveReplyRootId,
} from "./threading.ts";
import { THREAD_LINK_MARKER } from "./threadLinks.ts";
import { undoThreadLink } from "./threadLinkUndo.ts";
import { latestOrdinaryTopLevel } from "./threadLinkReadFrontier.ts";

const alice = new Uint8Array(32).fill(1),
  bob = new Uint8Array(32).fill(2);
const channelId = "11111111-2222-4333-8444-555555555555";
const scope = { communityUrl: "https://relay.example", channelId };
const sign = (content, tags, created_at = 10, key = alice, kind = 9) =>
  finalizeEvent({ kind, created_at, content, tags }, key);
const message = (text, time, parent, root = parent) =>
  sign(
    text,
    parent
      ? buildReplyTags(channelId, "", parent.id, root.id)
      : [["h", channelId]],
    time,
  );
const link = (child, parent, previous = "none", time = 100, key = alice) =>
  sign(
    "Thread organization.",
    [
      ["h", channelId],
      ["t", THREAD_LINK_MARKER],
      ["buzz-thread-op", parent ? "link" : "unlink"],
      ["buzz-thread-child", child.id],
      ["buzz-thread-previous", previous],
      ...(parent ? [["buzz-thread-parent", parent.id]] : []),
    ],
    time,
    key,
  );

function source(events) {
  const calls = [];
  const deps = {
    isCurrent: () => true,
    parse: async (annotations, scope) =>
      runThreadLinkWork({ type: "parse", annotations, scope }),
    project: async (input) => runThreadLinkWork({ type: "project", ...input }),
    fetch: async (filter) => {
      calls.push(filter);
      return events
        .filter(
          (e) =>
            filter.kinds.includes(e.kind) &&
            (!filter.ids || filter.ids.includes(e.id)) &&
            Object.entries(filter)
              .filter(([name]) => name.startsWith("#"))
              .every(([tag, values]) =>
                e.tags.some(
                  (t) => t[0] === tag.slice(1) && values.includes(t[1]),
                ),
              ) &&
            (filter.until === undefined ||
              e.created_at < filter.until ||
              (e.created_at === filter.until &&
                (!filter.before_id || e.id > filter.before_id))),
        )
        .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))
        .slice(0, filter.limit);
    },
    replies: async (root) => ({
      events: events.filter((e) => getThreadReference(e.tags).rootId === root),
      nextCursor: null,
    }),
  };
  return { deps, calls, load: () => loadThreadLinkSnapshot(scope, deps) };
}

test("production loader unions both canonical subthreads, overlays and presentation without touching wire ancestry", async () => {
  const a = message("Release plan", 1),
    c = message("Packaging notes", 2);
  const aReply = message("Approved", 3, a),
    cReply = message("Native packaging reply", 4, c);
  const edit = sign("Packaging notes revised", [["e", c.id]], 5, alice, 40003);
  const move = link(c, a);
  const originals = [a, c, aReply, cReply, edit, move];
  const bytes = JSON.stringify(originals);
  const rpc = source(originals);
  const snapshot = await rpc.load();
  assert.equal(snapshot.projection.status, "complete");
  assert.deepEqual(new Set(snapshot.canonicalRoots), new Set([a.id, c.id]));
  assert.ok(
    snapshot.events.some((e) => e.id === edit.id),
    "top-level moved root overlays loaded by target",
  );
  const view = applyThreadLinkPresentation(
    formatTimelineMessages(snapshot.events),
    snapshot,
  );
  assert.equal(view.find((m) => m.id === c.id).parentId, a.id);
  assert.equal(view.find((m) => m.id === c.id).canonicalParentId, null);
  assert.equal(view.find((m) => m.id === cReply.id).rootId, a.id);
  assert.equal(view.find((m) => m.id === cReply.id).canonicalRootId, c.id);
  assert.equal(
    view.some((m) => m.id === move.id),
    false,
  );
  assert.ok(
    buildThreadPanelData(view, a.id, null, new Set([c.id])).visibleReplies.some(
      (e) => e.message.id === cReply.id,
    ),
  );
  assert.equal(resolveReplyRootId(c.id, originals), c.id);
  const reply = message("Reply after the move", 110, cReply, c);
  const refreshedView = applyThreadLinkPresentation(
    formatTimelineMessages([...snapshot.events, reply]),
    snapshot,
  );
  assert.equal(refreshedView.find((m) => m.id === reply.id).rootId, a.id);
  assert.equal(
    refreshedView.find((m) => m.id === reply.id).canonicalRootId,
    c.id,
  );
  assert.equal(getThreadReference(reply.tags).rootId, c.id);
  assert.ok(verifyEvent(reply));
  assert.equal(JSON.stringify(originals), bytes);
  const summaries = new Map([
    [a.id, { replyCount: 99 }],
    [c.id, { replyCount: 77 }],
    ["unrelated", { replyCount: 1 }],
  ]);
  assert.deepEqual(
    [...threadLinkRelaySummaries(summaries, snapshot).keys()],
    ["unrelated"],
  );
});

test("invalid/unauthorized annotations stay ordinary visible content; missing messages do not produce invented moves", async () => {
  const a = message("Parent", 1),
    c = message("Child", 2);
  const foreign = link(c, a, "none", 100, bob),
    unavailable = link(message("Not on relay", 3), a, "none", 101);
  const snapshot = await source([a, c, foreign, unavailable]).load();
  assert.equal(snapshot.projection.status, "complete");
  assert.equal(snapshot.projection.heads.size, 0);
  const view = applyThreadLinkPresentation(
    formatTimelineMessages([a, c, foreign, unavailable]),
    snapshot,
  );
  assert.ok(view.some((m) => m.id === foreign.id));
  assert.ok(view.some((m) => m.id === unavailable.id));
  assert.equal(view.find((m) => m.id === c.id).parentId, null);
});

test("history/timeouts/stale scope never commit a partial projected union", async () => {
  const a = message("Parent", 1),
    c = message("Child", 2),
    move = link(c, a);
  const rpc = source([a, c, move]);
  rpc.deps.replies = async () => {
    throw Error("offline");
  };
  await assert.rejects(rpc.load(), /offline/);
  rpc.deps.isCurrent = () => false;
  await assert.rejects(rpc.load(), { name: "AbortError" });
  const incomplete = { ...(await source([a, c, move]).load()) };
  incomplete.projection = { ...incomplete.projection, status: "incomplete" };
  const raw = formatTimelineMessages([a, c, move]);
  assert.equal(applyThreadLinkPresentation(raw, incomplete), raw);
});

test("composite annotation pages prove complete coverage, or fail closed at nonadvancing/bounded history", async () => {
  const rows = Array.from({ length: 201 }, (_, i) => ({
    id: i.toString(16).padStart(64, "0"),
    created_at: 1,
    kind: 9,
    tags: [],
    content: "",
    pubkey: "",
    sig: "",
  }));
  const rpc = source(rows);
  const all = await fetchThreadLinkPages(
    rpc.deps,
    { kinds: [9], limit: 200 },
    1000,
  );
  assert.equal(all.length, 201);
  assert.equal(rpc.calls[1].before_id, rows[199].id);
  rpc.deps.fetch = async () => rows.slice(0, 200);
  await assert.rejects(
    fetchThreadLinkPages(rpc.deps, { kinds: [9], limit: 200 }, 1000),
    /did not advance/,
  );
  await assert.rejects(
    fetchThreadLinkPages(source(rows).deps, { kinds: [9], limit: 200 }, 200),
    /exceeded/,
  );
});

test("undo saves exact signed receipt before publishing and retries lost ACK with the same event ID", async () => {
  const a = message("Parent", 1),
    c = message("Child", 2),
    move = link(c, a);
  const events = [a, c, move];
  let saved = null,
    signs = 0,
    publishes = 0;
  const input = {
    scope,
    scopeKey: "test-scope",
    identity: c.pubkey,
    childId: c.id,
    previousId: move.id,
  };
  const deps = {
    current: () => true,
    load: () => source(events).load(),
    member: async () => true,
    clock: () => 102000,
    read: () => saved,
    save: (value) => {
      saved = value;
      return true;
    },
    sign: async (value) => {
      signs++;
      return sign(value.content, value.tags, value.createdAt);
    },
    publish: async (event) => {
      assert.equal(saved.event.id, event.id);
      publishes++;
      events.push(event);
      throw Error("Lost ACK");
    },
  };
  await assert.rejects(undoThreadLink(input, deps), /Lost ACK/);
  const receipt = saved.event.id;
  const after = await undoThreadLink(input, deps);
  assert.equal(after.state, "verified");
  assert.equal(after.event.id, receipt);
  assert.equal(signs, 1);
  assert.equal(publishes, 1, "readback recovers before republishing");
  assert.equal(
    (await source(events).load()).projection.messages.get(c.id)
      .presentationParentId,
    null,
  );
});

test("undo cannot publish without a durable journal or after losing scope/authorization", async () => {
  const a = message("Parent", 1),
    c = message("Child", 2),
    move = link(c, a);
  let writes = 0;
  const input = {
    scope,
    scopeKey: "s",
    identity: c.pubkey,
    childId: c.id,
    previousId: move.id,
  };
  const deps = {
    current: () => true,
    load: () => source([a, c, move]).load(),
    member: async () => true,
    clock: () => 102000,
    read: () => null,
    save: () => false,
    sign: async (e) => sign(e.content, e.tags, e.createdAt),
    publish: async () => {
      writes++;
    },
  };
  await assert.rejects(
    undoThreadLink(input, deps),
    /receipt before publishing/,
  );
  assert.equal(writes, 0);
  await assert.rejects(
    undoThreadLink({ ...input, identity: "b".repeat(64) }, deps),
    /author/,
  );
  await assert.rejects(
    undoThreadLink(input, { ...deps, current: () => false }),
    { name: "AbortError" },
  );
});

test("only unresolved/accepted controls hold back the read frontier; signed spoofed markers regain ordinary eligibility", async () => {
  const a = message("Parent", 1),
    c = message("Child", 2);
  const accepted = link(c, a);
  const foreign = link(c, a, "none", 101, bob);
  const markerOnly = sign(
    "Ordinary signed message with a spoofed marker",
    [
      ["h", channelId],
      ["t", THREAD_LINK_MARKER],
    ],
    102,
  );
  const events = [a, c, accepted, foreign, markerOnly];
  assert.equal(
    latestOrdinaryTopLevel(events, new Set()).id,
    c.id,
    "pending crypto cannot advance over originals",
  );
  const snapshot = await source(events).load();
  const rejected = new Set(
    snapshot.projection.decisions
      .filter((d) => d.state === "rejected")
      .map((d) => d.annotationId),
  );
  assert.ok(rejected.has(foreign.id));
  assert.ok(rejected.has(markerOnly.id));
  assert.ok(!rejected.has(accepted.id));
  assert.equal(
    latestOrdinaryTopLevel([a, c, accepted], rejected).id,
    c.id,
    "accepted receipt never advances original read state",
  );
  assert.equal(
    latestOrdinaryTopLevel([a, c, accepted, foreign], rejected).id,
    foreign.id,
    "unauthorized annotation is ordinary content",
  );
  assert.equal(
    latestOrdinaryTopLevel(events, rejected).id,
    markerOnly.id,
    "marker-only signed spam cannot suppress ordinary read eligibility",
  );
  assert.ok(
    applyThreadLinkPresentation(formatTimelineMessages(events), snapshot).some(
      (m) => m.id === markerOnly.id,
    ),
  );
});

test("worker input is bounded in bytes as well as number of messages", async () => {
  const oversized = {
    id: "a".repeat(64),
    created_at: 1,
    kind: 9,
    tags: [],
    content: "x".repeat(17 * 1024 * 1024),
    pubkey: "",
    sig: "",
  };
  const rpc = source([oversized]);
  await assert.rejects(
    fetchThreadLinkPages(rpc.deps, { kinds: [9], limit: 200 }, 1000),
    /byte bound/,
  );
});

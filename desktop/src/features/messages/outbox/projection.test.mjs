import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import {
  outboxLocalKey,
  pendingOutboxEvent,
  projectPendingOutboxRows,
  projectAcceptedOutboxEvent,
} from "./projection.ts";
import {
  channelMessagesKey,
  channelWindowKey,
} from "../lib/messageQueryKeys.ts";
import {
  emptyChannelWindowStore,
  flattenChannelWindowEvents,
  replaceNewestChannelWindow,
} from "../lib/channelWindowStore.ts";
import { projectChannelWindowMessages } from "../lib/projectChannelWindow.ts";
import { reconcileIncomingMessage } from "../lib/messageMerge.ts";
const owner = "a".repeat(64),
  channel = "channel";
const row = (id = "queue-1", changes = {}) => ({
  id,
  sequence: 1,
  revision: 0,
  intendedAt: 1,
  message: {
    channelId: channel,
    parentEventId: "nested",
    rootEventId: "root",
    content: "identical text",
    mentionPubkeys: [],
    tags: [],
    relayUrl: "https://relay.example",
    signerPubkey: owner,
  },
  localSendOrigin: { viewInstanceId: "origin-view", threadRootId: "root" },
  attachments: [],
  state: "waiting",
  attempts: 0,
  nextAttemptAt: 0,
  ...changes,
});
const messages = (client) =>
  client.getQueryData(channelMessagesKey(channel)) ?? [];
const ack = (
  record,
  id = "signed-1",
  content = "canonical body with uploaded URL",
) => ({
  ...pendingOutboxEvent(record),
  id,
  localKey: undefined,
  localSendIntent: undefined,
  content,
  sig: "real",
  pending: false,
});
const page = (events) => ({
  startCursor: null,
  rows: events.map((event) => ({ event, thread: null })),
  aux: [],
  hasMore: false,
  nextCursor: null,
});
const client = () =>
  new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });

test("durable pending identity carries captured nested ancestry and presentation owner", () => {
  const record = row(),
    event = pendingOutboxEvent(record);
  assert.equal(event.pending, true);
  assert.equal(event.id, outboxLocalKey(record.id));
  assert.equal(event.localKey, event.id);
  assert.deepEqual(event.localSendIntent, {
    id: record.id,
    ...record.localSendOrigin,
  });
  assert.ok(
    event.tags.some(
      (tag) => tag[0] === "e" && tag[1] === "nested" && tag[3] === "reply",
    ),
  );
  assert.ok(
    event.tags.some(
      (tag) => tag[0] === "e" && tag[1] === "root" && tag[3] === "root",
    ),
  );
  assert.ok(
    event.tags.some(
      (tag) => tag[0] === "client_msg_id" && tag[1] === record.id,
    ),
  );
});
test("long-offline pending overlays bypass oldest-page bounds without moving cursors", () => {
  const cache = client(),
    record = row(),
    newer = { ...ack(row("history"), "history"), created_at: 100 };
  const window = replaceNewestChannelWindow(
    emptyChannelWindowStore(),
    page([newer]),
  );
  cache.setQueryData(channelWindowKey(channel), window);
  projectPendingOutboxRows(cache, [record]);
  assert.equal(messages(cache).filter((event) => event.pending).length, 1);
  assert.deepEqual(
    cache.getQueryData(channelWindowKey(channel)).pages,
    window.pages,
  );
  cache.clear();
});
test("attachment body change and two identical queued messages reconcile by exact UUID", () => {
  const first = row("first"),
    second = row("second");
  const merged = reconcileIncomingMessage(
    [pendingOutboxEvent(first), pendingOutboxEvent(second)],
    ack(second, "accepted-second"),
  );
  assert.equal(merged.length, 2);
  assert.equal(
    merged.find((event) => event.id === "accepted-second").localKey,
    outboxLocalKey(second.id),
  );
  assert.equal(
    merged.find((event) => event.id === outboxLocalKey(first.id)).pending,
    true,
  );
});
test("raw canonical head refetch retains accepted render key and local-send origin", () => {
  const cache = client(),
    record = row();
  projectPendingOutboxRows(cache, [record]);
  const accepted = ack(record);
  projectAcceptedOutboxEvent(cache, accepted, record);
  const window = cache.getQueryData(channelWindowKey(channel));
  cache.setQueryData(
    channelWindowKey(channel),
    replaceNewestChannelWindow(window, page([accepted])),
  );
  projectChannelWindowMessages(cache, channel);
  const canonical = messages(cache).find((event) => event.id === accepted.id);
  assert.equal(canonical.localKey, outboxLocalKey(record.id));
  assert.deepEqual(canonical.localSendIntent, {
    id: record.id,
    ...record.localSendOrigin,
  });
  assert.equal(canonical.pending, false);
  assert.equal(canonical.content, accepted.content);
  cache.clear();
});
test("edit updates one stable pending row and deletion removes only owned projections", () => {
  const cache = client(),
    record = row(),
    unrelated = { ...ack(row("other"), "unrelated"), tags: [["h", channel]] };
  cache.setQueryData(channelWindowKey(channel), {
    ...emptyChannelWindowStore(),
    liveOverlay: [unrelated],
  });
  projectPendingOutboxRows(cache, [record]);
  projectPendingOutboxRows(cache, [
    {
      ...record,
      revision: 2,
      message: { ...record.message, content: "corrected caption" },
    },
  ]);
  assert.equal(messages(cache).filter((event) => event.pending).length, 1);
  assert.equal(
    messages(cache).find((event) => event.pending).content,
    "corrected caption",
  );
  assert.equal(
    messages(cache).find((event) => event.pending).localKey,
    outboxLocalKey(record.id),
  );
  projectPendingOutboxRows(cache, []);
  assert.deepEqual(
    messages(cache).map((event) => event.id),
    [unrelated.id],
  );
  assert.equal(
    flattenChannelWindowEvents(
      cache.getQueryData(channelWindowKey(channel)),
    ).some((event) => event.pending),
    false,
  );
  cache.clear();
});
test("accepted checkpoint before callback retains authored body through journal removal", () => {
  const cache = client(),
    record = row(),
    event = ack(record);
  projectPendingOutboxRows(cache, [record]);
  projectPendingOutboxRows(cache, [
    { ...record, accepted: true, signedEvent: event },
  ]);
  assert.equal(messages(cache).length, 1);
  assert.equal(messages(cache)[0].id, event.id);
  assert.equal(messages(cache)[0].localKey, outboxLocalKey(record.id));
  projectPendingOutboxRows(cache, []);
  assert.equal(messages(cache)[0].id, event.id);
  cache.clear();
});
test("late pending refresh cannot regress an accepted receipt or duplicate its row", () => {
  const cache = client(),
    record = row(),
    event = ack(record);
  projectPendingOutboxRows(cache, [record]);
  projectAcceptedOutboxEvent(cache, event, record);
  projectPendingOutboxRows(cache, [record]);
  assert.equal(messages(cache).length, 1);
  assert.equal(messages(cache)[0].pending, false);
  const merged = reconcileIncomingMessage(
    messages(cache),
    pendingOutboxEvent(record),
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, event.id);
  assert.equal(merged[0].pending, false);
  cache.clear();
});
test("recovered durable rows without origin carry no invented fresh-send intent", () => {
  const record = row();
  delete record.localSendOrigin;
  assert.equal(pendingOutboxEvent(record).localSendIntent, undefined);
});
test("unchanged progress snapshots do not reinsert or remove the pending body", () => {
  const cache = client(),
    record = row();
  projectPendingOutboxRows(cache, [record]);
  const priorMessages = messages(cache),
    priorWindow = cache.getQueryData(channelWindowKey(channel));
  projectPendingOutboxRows(cache, [
    { ...record, error: "offline", attempts: 2 },
  ]);
  assert.equal(messages(cache), priorMessages);
  assert.equal(cache.getQueryData(channelWindowKey(channel)), priorWindow);
  cache.clear();
});

test("independent inline/sidebar query echoes before ACK keep one client-owned identity", async () => {
  const { mergeOwnThreadLocalEvents } = await import(
    "../lib/independentThreadPanel.ts"
  );
  const record = row(),
    pending = pendingOutboxEvent(record),
    accepted = ack(record);
  const merged = mergeOwnThreadLocalEvents(
    [pending],
    [accepted, accepted],
    "root",
    owner,
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, accepted.id);
  assert.equal(merged[0].localKey, pending.localKey);
  assert.deepEqual(merged[0].localSendIntent, pending.localSendIntent);
  assert.equal(merged[0].content, accepted.content);
  assert.deepEqual(mergeOwnThreadLocalEvents([], [], "root", owner), []);
});

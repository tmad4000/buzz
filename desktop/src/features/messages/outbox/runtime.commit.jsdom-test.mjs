import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { outboxStorage } from "./storage.ts";
import {
  enqueueOutbox,
  deleteOutbox,
  startOutbox,
  outboxSnapshot,
} from "./runtime.ts";
import { projectPendingOutboxRows } from "./projection.ts";
import { channelMessagesKey } from "../lib/messageQueryKeys.ts";

test("durable commit projects the pending cache before composer ACK and any worker admission", async () => {
  const original = { ...outboxStorage };
  const locks = Object.getOwnPropertyDescriptor(navigator, "locks");
  // Keep native publication parked; this test exercises the production commit
  // admission path against a controlled completed-transaction boundary.
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: { request: () => new Promise(() => {}) },
  });
  let stored = [];
  let complete;
  const committed = new Promise((resolve) => {
    complete = resolve;
  });
  outboxStorage.all = async () => structuredClone(stored);
  outboxStorage.add = async (row) => {
    await committed;
    const saved = { ...row, sequence: 1 };
    stored = [saved];
    return saved;
  };
  outboxStorage.remove = async (id) => {
    stored = stored.filter((row) => row.id !== id);
  };
  const cache = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  const order = [];
  const stop = startOutbox(
    () => {},
    (row) => {
      order.push("committed");
      assert.equal(stored[0].id, row.id);
      projectPendingOutboxRows(cache, outboxSnapshot());
    },
  );
  let delivery;
  try {
    await assert.rejects(
      enqueueOutbox(
        {
          channelId: "channel",
          parentEventId: "outbox-local:not-signed",
          rootEventId: "root",
          content: "must stay a draft",
          mentionPubkeys: [],
          tags: [],
          relayUrl: "https://relay.example",
          signerPubkey: "a".repeat(64),
        },
        {
          attachments: [],
          onQueued: () => assert.fail("invalid destination committed"),
        },
      ),
      /not been sent/,
    );
    assert.deepEqual(stored, []);
    delivery = enqueueOutbox(
      {
        channelId: "channel",
        parentEventId: "branch",
        rootEventId: "root",
        content: "durable body",
        mentionPubkeys: [],
        tags: [],
        relayUrl: "https://relay.example",
        signerPubkey: "a".repeat(64),
      },
      {
        attachments: [],
        localSendOrigin: {
          viewInstanceId: "source-view",
          threadRootId: "root",
        },
        onQueued: () => {
          order.push("composer-ack");
          const body = cache
            .getQueryData(channelMessagesKey("channel"))
            ?.find((event) => event.pending);
          assert.equal(body?.content, "durable body");
          assert.equal(body?.localSendIntent?.viewInstanceId, "source-view");
        },
      },
    );
    delivery.catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, []);
    assert.equal(cache.getQueryData(channelMessagesKey("channel")), undefined);
    complete();
    for (let i = 0; i < 10 && order.length < 2; i++)
      await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(order, ["committed", "composer-ack"]);
    const projected = cache
      .getQueryData(channelMessagesKey("channel"))
      ?.find((event) => event.pending);
    assert.equal(projected?.content, "durable body");
    assert.equal(projected?.localSendIntent?.viewInstanceId, "source-view");
    await deleteOutbox(stored[0].id);
    await assert.rejects(delivery, /deleted/);
  } finally {
    stop();
    cache.clear();
    Object.assign(outboxStorage, original);
    if (locks) Object.defineProperty(navigator, "locks", locks);
    else delete navigator.locks;
  }
});

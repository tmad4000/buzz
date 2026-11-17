import assert from "node:assert/strict";
import test from "node:test";
import { OutboxEngine, retryDelay, conversationKey } from "./engine.ts";
const record = (id = "first", sequence = 1, changes = {}) => ({
  id,
  sequence,
  revision: 0,
  intendedAt: 10,
  message: {
    channelId: "channel",
    parentEventId: null,
    rootEventId: null,
    content: "Text survives",
    mentionPubkeys: [],
    tags: [],
    relayUrl: "https://relay.example",
    signerPubkey: "owner",
    ...changes,
  },
  attachments: [
    { bytes: new Blob(["image bytes"]), name: "photo.png", spoilered: false },
  ],
  state: "waiting",
  attempts: 0,
  nextAttemptAt: 0,
});
function fixture(rows = [record()]) {
  let saved = structuredClone(rows),
    now = 100,
    signatures = 0;
  const calls = [];
  const storage = {
    all: async () =>
      structuredClone(saved).sort((a, b) => a.sequence - b.sequence),
    put: async (row) => {
      saved = saved.map((r) =>
        r.id === row.id
          ? structuredClone({ ...row, revision: row.revision + 1 })
          : r,
      );
    },
    add: async (row) => {
      saved.push(structuredClone(row));
      return row;
    },
    remove: async (id) => {
      saved = saved.filter((r) => r.id !== id);
    },
  };
  const transport = {
    find: async () => null,
    authorize: async () => {},
    prepareAgents: async () => {},
    wake: async () => {},
    owns: async () => true,
    upload: async (row, index, progress) => {
      calls.push(["upload", row.id, index]);
      assert.equal(await row.attachments[index].bytes.text(), "image bytes");
      progress(0.5);
      return {
        url: "https://relay.example/media/image",
        sha256: "hash",
        type: "image/png",
        size: 11,
        uploaded: 1,
      };
    },
    prepare: async (row) => ({
      id: `signed-${++signatures}`,
      sig: `sig-${signatures}`,
      pubkey: "owner",
      kind: 9,
      content: row.message.content,
      tags: [["h", row.message.channelId]],
      created_at: Math.floor(now / 1000),
    }),
    publish: async (row) => {
      calls.push(["publish", row.id, row.signedEvent.id]);
      const durable = (await storage.all()).find((r) => r.id === row.id);
      assert.deepEqual(
        durable.signedEvent,
        row.signedEvent,
        "commit signed bytes before publication",
      );
      assert.equal(durable.deliveryUncertain, true);
    },
    accepted: (row) => calls.push(["accepted", row.id]),
  };
  return {
    storage,
    transport,
    calls,
    get signatures() {
      return signatures;
    },
    advance: (ms = 10_000) => {
      now += ms;
    },
    build: () =>
      new OutboxEngine(
        storage,
        transport,
        async () => {},
        (id, value) => calls.push(["progress", id, value]),
        () => now,
      ),
  };
}
test("upload checkpoints and signed bytes precede publication", async () => {
  const s = fixture();
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.deepEqual(await s.storage.all(), []);
  assert.ok(
    s.calls.some(([kind, , value]) => kind === "progress" && value === 0.5),
  );
});
test("offline-online preserves FIFO, persisted backoff, attachments and event id", async () => {
  const s = fixture([record(), record("second", 2)]),
    publish = s.transport.publish;
  s.transport.publish = async () => {
    throw new Error("network disconnected");
  };
  await s.build().drain();
  const rows = await s.storage.all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].message.content, "Text survives");
  assert.equal(rows[0].state, "waiting");
  assert.ok(rows[0].nextAttemptAt > 100);
  await s.build().drain();
  assert.equal(s.signatures, 1);
  s.advance();
  s.transport.publish = publish;
  await s.build().drain();
  assert.equal(s.signatures, 2);
  assert.deepEqual(await s.storage.all(), []);
  assert.deepEqual(
    s.calls.filter(([kind]) => kind === "accepted").map(([, id]) => id),
    ["first", "second"],
  );
  assert.equal(s.calls.filter(([kind]) => kind === "upload").length, 2);
});
test("lost acknowledgement retries exact signed bytes after restart without duplication", async () => {
  const s = fixture(),
    server = new Map();
  let first = true;
  s.transport.publish = async (row) => {
    server.set(row.signedEvent.id, structuredClone(row.signedEvent));
    if (first) {
      first = false;
      throw new Error("socket died after acceptance");
    }
  };
  await s.build().drain();
  const signed = (await s.storage.all())[0].signedEvent;
  s.advance();
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.equal(server.size, 1);
  assert.deepEqual(server.get(signed.id), signed);
  assert.deepEqual(await s.storage.all(), []);
});
test("restart resumes the missing upload and keeps raw bytes", async () => {
  const row = record();
  row.attachments.push(structuredClone(row.attachments[0]));
  const s = fixture([row]),
    upload = s.transport.upload;
  let fail = true;
  s.transport.upload = async (row, index, progress) => {
    if (index === 1 && fail) {
      fail = false;
      throw new Error("offline during upload");
    }
    return upload(row, index, progress);
  };
  await s.build().drain();
  const saved = (await s.storage.all())[0];
  assert.ok(saved.attachments[0].descriptor);
  assert.equal(saved.attachments[1].descriptor, undefined);
  assert.equal(await saved.attachments[1].bytes.text(), "image bytes");
  assert.equal(s.signatures, 0);
  s.advance();
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.equal(s.calls.filter(([kind]) => kind === "upload").length, 2);
});
test("failed head blocks its conversation while other threads progress", async () => {
  const first = record();
  first.state = "failed";
  const s = fixture([
    first,
    record("second", 2),
    record("other", 3, { rootEventId: "thread" }),
  ]);
  await s.build().drain();
  assert.deepEqual(
    s.calls.filter(([kind]) => kind === "accepted").map(([, id]) => id),
    ["other"],
  );
  assert.equal((await s.storage.all()).length, 2);
});
test("community switch during upload prevents signing or publication", async () => {
  const s = fixture(),
    upload = s.transport.upload;
  let owns = true;
  s.transport.owns = async () => owns;
  s.transport.upload = async (...args) => {
    const result = await upload(...args);
    owns = false;
    return result;
  };
  await s.build().drain();
  assert.equal(s.signatures, 0);
  assert.equal((await s.storage.all()).length, 1);
  owns = true;
  s.advance();
  await s.build().drain();
  assert.equal(s.signatures, 1);
});
test("signed journal write failure never publishes uncommitted bytes", async () => {
  const s = fixture(),
    put = s.storage.put;
  s.storage.put = async (row) => {
    if (row.signedEvent) throw new Error("disk full");
    await put(row);
  };
  await assert.rejects(s.build().drain(), /disk full/);
  assert.equal(s.calls.filter(([kind]) => kind === "publish").length, 0);
  assert.equal((await s.storage.all())[0].signedEvent, undefined);
});
test("failed deletion after acceptance resumes cleanup without republishing", async () => {
  const s = fixture(),
    remove = s.storage.remove;
  s.storage.remove = async () => {
    throw new Error("disk unavailable");
  };
  await s.build().drain();
  assert.equal((await s.storage.all()).length, 1);
  s.storage.remove = remove;
  s.advance();
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.equal(s.calls.filter(([kind]) => kind === "publish").length, 1);
});
test("UI projection failure cannot resurrect a deleted accepted message", async () => {
  const s = fixture();
  s.transport.accepted = () => {
    throw new Error("projection failed");
  };
  await s.build().drain();
  assert.deepEqual(await s.storage.all(), []);
});
test("conversation ordering is scoped by relay, owner, channel and thread", () => {
  for (const change of [
    { relayUrl: "https://other" },
    { signerPubkey: "other" },
    { channelId: "other" },
    { rootEventId: "thread" },
  ])
    assert.notEqual(
      conversationKey(record()),
      conversationKey(record("other", 2, change)),
    );
});
test("backoff grows with jitter and caps at five minutes", () => {
  assert.equal(
    retryDelay(1, () => 0.5),
    1000,
  );
  assert.equal(
    retryDelay(2, () => 0.5),
    2000,
  );
  assert.equal(
    retryDelay(50, () => 0.5),
    300000,
  );
  assert.equal(
    retryDelay(1, () => 0),
    800,
  );
});

test("expired signature is replaced only after a successful absence lookup", async () => {
  const s = fixture();
  const server = [];
  let online = false;
  s.transport.find = async () => null;
  s.transport.publish = async (row) => {
    server.push(structuredClone(row));
    if (!online) throw new Error("offline");
  };
  await s.build().drain();
  const old = (await s.storage.all())[0];
  s.advance(901_000);
  online = true;
  await s.build().drain();
  assert.equal(s.signatures, 2);
  assert.equal(server[0].id, server[1].id);
  assert.equal(server[0].message.content, server[1].message.content);
  assert.equal(server[0].message.channelId, server[1].message.channelId);
  assert.equal(server[0].intendedAt, server[1].intendedAt);
  assert.notEqual(server[0].signedEvent.id, server[1].signedEvent.id);
  assert.ok(server[1].signedEventIds.includes(old.signedEvent.id));
});

test("accepted expired version is found without re-signing or republishing", async () => {
  const s = fixture();
  let accepted;
  s.transport.publish = async (row) => {
    accepted = structuredClone(row.signedEvent);
    throw new Error("lost ack");
  };
  await s.build().drain();
  s.advance(901_000);
  s.transport.find = async () => ({ event: accepted });
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.deepEqual(await s.storage.all(), []);
});

test("lookup error never authorizes re-signing an expired ambiguous attempt", async () => {
  const s = fixture();
  s.transport.publish = async () => {
    throw new Error("lost ack");
  };
  await s.build().drain();
  const old = (await s.storage.all())[0].signedEvent;
  s.advance(901_000);
  s.transport.find = async () => {
    throw new Error("lookup unavailable");
  };
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.deepEqual((await s.storage.all())[0].signedEvent, old);
});

test("deletion receipt retires an accepted message without reintroducing it", async () => {
  const s = fixture();
  s.transport.publish = async () => {
    throw new Error("lost ack");
  };
  await s.build().drain();
  s.advance(901_000);
  s.transport.find = async () => ({ deleted: true });
  await s.build().drain();
  assert.equal(s.signatures, 1);
  assert.deepEqual(await s.storage.all(), []);
});

test("durable agent wake survives restart and never repeats message publication", async () => {
  const row = record();
  row.wakes = [{ pubkey: "agent", replayFloorUnix: 5 }];
  const s = fixture([row]);
  let failed = true;
  s.transport.wake = async () => {
    if (failed) {
      failed = false;
      throw new Error("agent start offline");
    }
  };
  await s.build().drain();
  const saved = (await s.storage.all())[0];
  assert.equal(saved.accepted, true);
  assert.equal(saved.wakes.length, 1);
  s.advance();
  await s.build().drain();
  assert.deepEqual(await s.storage.all(), []);
  assert.equal(s.calls.filter(([kind]) => kind === "publish").length, 1);
});

test("fresh authorization after upload blocks revoked recipients before publication", async () => {
  const s = fixture();
  s.transport.authorize = async () => {
    throw new Error("not authorized");
  };
  await s.build().drain();
  assert.equal(s.calls.filter(([kind]) => kind === "publish").length, 0);
  assert.equal((await s.storage.all())[0].state, "failed");
});

test("queued deletion behind an active upload is reread before delivery", async () => {
  const s = fixture([record(), record("second", 2)]),
    upload = s.transport.upload;
  let started, release;
  const begun = new Promise((resolve) => (started = resolve)),
    hold = new Promise((resolve) => (release = resolve));
  s.transport.upload = async (...args) => {
    started();
    await hold;
    return upload(...args);
  };
  const draining = s.build().drain();
  await begun;
  await s.storage.remove("second");
  release();
  await draining;
  assert.deepEqual(
    s.calls.filter(([kind]) => kind === "accepted").map(([, id]) => id),
    ["first"],
  );
});

test("worker lock remains held until every started lane settles after storage failure", async () => {
  const s = fixture([record(), record("other", 2, { rootEventId: "other" })]);
  let started, release;
  const begun = new Promise((resolve) => (started = resolve)),
    hold = new Promise((resolve) => (release = resolve));
  const put = s.storage.put,
    upload = s.transport.upload;
  s.transport.upload = async (...args) => {
    if (args[0].id === "other") {
      started();
      await hold;
    }
    return upload(...args);
  };
  s.storage.put = async (row) => {
    if (row.id === "first" && row.signedEvent) throw new Error("disk full");
    await put(row);
  };
  let settled = false;
  const draining = s
    .build()
    .drain()
    .then(
      () => {
        settled = true;
      },
      (error) => {
        settled = true;
        throw error;
      },
    );
  await begun;
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(settled, false);
  release();
  await assert.rejects(draining, /disk full/);
  assert.equal(settled, true);
});

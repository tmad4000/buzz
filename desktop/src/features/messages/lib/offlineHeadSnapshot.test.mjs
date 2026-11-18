import assert from "node:assert/strict";
import test from "node:test";
import { offlineHeadSnapshot } from "./offlineHeadSnapshot.ts";
import { parseChannelWindowResponse } from "./channelWindowResponse.ts";
import { emptyChannelWindowStore } from "./channelWindowStore.ts";
const event = (id, at) => ({
  id,
  created_at: at,
  kind: 9,
  pubkey: "author",
  sig: "",
  content: id,
  tags: [["h", "general"]],
});
test("folded head reparses with bounded rows, committed live events, aux and reply summaries", () => {
  const store = emptyChannelWindowStore();
  store.pages = [
    {
      startCursor: null,
      rows: [
        {
          event: event("old", 1),
          thread: {
            replyCount: 2,
            descendantCount: 2,
            lastReplyAt: 4,
            participantPubkeys: ["author"],
          },
        },
      ],
      aux: [],
      hasMore: false,
      nextCursor: null,
    },
  ];
  store.liveOverlay = [
    event("new", 5),
    { ...event("pending", 6), pending: true },
  ];
  store.liveAux = [
    { ...event("edit-root", 6), kind: 40003, tags: [["e", "new"]] },
    { ...event("delete-edit", 8), kind: 5, tags: [["e", "edit-root"]] },
    {
      ...event("edit-unopened-reply", 7),
      kind: 40003,
      tags: [["e", "unopened-reply"]],
      content: "uncached reply body",
    },
  ];
  let snapshot = offlineHeadSnapshot(store, "general", 100);
  assert.equal(
    snapshot.some((event) => event.id === "edit-root"),
    true,
  );
  assert.equal(
    snapshot.some((event) => event.id === "edit-unopened-reply"),
    false,
  );
  let page = parseChannelWindowResponse(snapshot, "general", null);
  assert.deepEqual(
    page.rows.map((row) => row.event.id),
    ["new", "old"],
  );
  assert.equal(page.rows[1].thread.replyCount, 2);
  assert.equal(page.hasMore, false);
  snapshot = offlineHeadSnapshot(store, "general", 1);
  page = parseChannelWindowResponse(snapshot, "general", null);
  assert.equal(page.rows.length, 1);
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, { createdAt: 5, eventId: "new" });
  assert.equal(
    offlineHeadSnapshot(emptyChannelWindowStore(), "general", 50),
    null,
  );
});

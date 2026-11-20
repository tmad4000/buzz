import assert from "node:assert/strict";
import { test } from "node:test";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import {
  collectTimelineInitiators,
  filterTimelineInitiator,
  nextInitiatorFilter,
} from "./model.ts";
import { isTimelineInitiatorShortcut } from "./shortcut.ts";

const mine = Uint8Array.from({ length: 32 }, () => 1);
const agent = Uint8Array.from({ length: 32 }, () => 2);
const stranger = Uint8Array.from({ length: 32 }, () => 3);
const reader = getPublicKey(mine);
const agentKey = getPublicKey(agent);
const channel = "stream-a";
const event = (secret, tags, content) =>
  finalizeEvent(
    { kind: 9, created_at: 100, tags: [["h", channel], ...tags], content },
    secret,
  );
const rootMine = event(mine, [], "Mine");
const rootAgent = event(agent, [], "Agent");
const rootUnknown = event(
  stranger,
  [
    ["actor", reader],
    ["p", agentKey],
  ],
  "Unknown",
);
const tampered = { ...event(mine, [], "Signed"), content: "Modified" };
const agentReply = event(
  agent,
  [["e", rootMine.id, "", "reply"]],
  "Agent reply",
);
const humanReply = event(
  stranger,
  [
    ["e", rootMine.id, "", "root"],
    ["e", agentReply.id, "", "reply"],
  ],
  "Human nested reply",
);
const agentNested = event(
  agent,
  [
    ["e", rootMine.id, "", "root"],
    ["e", humanReply.id, "", "reply"],
  ],
  "Agent nested",
);
const crossChannel = event(
  agent,
  [
    ["h", "foreign"],
    ["e", rootMine.id, "", "reply"],
  ],
  "Cross channel",
);
const omittedAgentReply = event(
  agent,
  [["e", rootMine.id, "", "reply"]],
  "Nonvisible reply",
);

test("direct raw signatures and approved key evidence govern initiators and loaded reply counts", () => {
  const visible = [
    rootMine,
    rootAgent,
    rootUnknown,
    tampered,
    agentReply,
    humanReply,
    agentNested,
    crossChannel,
  ];
  const evidence = collectTimelineInitiators(
    [...visible, agentReply, omittedAgentReply],
    new Set(visible.map(({ id }) => id)),
    channel,
    reader,
    new Set([agentKey]),
  );
  assert.deepEqual(
    [...evidence.roots],
    [
      [rootMine.id, "mine"],
      [rootAgent.id, "agents"],
    ],
  );
  assert.deepEqual([...evidence.loadedAgentReplies], [[rootMine.id, 2]]);
  assert.equal(
    collectTimelineInitiators(
      visible,
      new Set(visible.map(({ id }) => id)),
      channel,
      reader,
      new Set(),
    ).roots.has(rootAgent.id),
    false,
  );
});

test("filters retain reply identity and ordering under selected roots and All keeps unknown roots", () => {
  const projection = [
    { id: rootUnknown.id },
    { id: rootMine.id },
    { id: agentReply.id, rootId: rootMine.id },
    { id: rootAgent.id },
    { id: humanReply.id, rootId: rootMine.id, parentId: agentReply.id },
  ];
  const evidence = collectTimelineInitiators(
    [rootMine, rootAgent, rootUnknown, agentReply, humanReply],
    new Set(projection.map(({ id }) => id)),
    channel,
    reader,
    new Set([agentKey]),
  );
  assert.equal(
    filterTimelineInitiator(projection, (row) => row, "all", evidence),
    projection,
  );
  assert.deepEqual(
    filterTimelineInitiator(projection, (row) => row, "mine", evidence),
    [projection[1], projection[2], projection[4]],
  );
  assert.deepEqual(
    filterTimelineInitiator(projection, (row) => row, "agents", evidence),
    [projection[3]],
  );
  assert.equal(evidence.loadedAgentReplies.has(rootAgent.id), false);
});

test("cycles a primary shifted Y chord and ignores repeats, composition, or competing modifiers", () => {
  const chord = {
    ctrlKey: true,
    metaKey: false,
    shiftKey: true,
    altKey: false,
    isComposing: false,
    defaultPrevented: false,
    repeat: false,
    key: "Y",
  };
  assert.equal(isTimelineInitiatorShortcut(chord), true);
  for (const invalid of [
    { repeat: true },
    { isComposing: true },
    { defaultPrevented: true },
    { altKey: true },
    { metaKey: true },
    { shiftKey: false },
    { key: "U" },
  ]) {
    assert.equal(isTimelineInitiatorShortcut({ ...chord, ...invalid }), false);
  }
  assert.deepEqual(["all", "mine", "agents"].map(nextInitiatorFilter), [
    "mine",
    "agents",
    "all",
  ]);
});

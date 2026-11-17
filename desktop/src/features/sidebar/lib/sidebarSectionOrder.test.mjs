import assert from "node:assert/strict";
import test from "node:test";
import {
  projectSectionOrder,
  writeSectionOrder,
  pinSectionOffers,
} from "./sidebarSectionOrder.ts";
import { projectSections, SECTIONS_LANE } from "./channelSectionsSync.ts";
import { decodeDoc, encodeDoc } from "./sidebarLaneStore.ts";
import { mergeTrees } from "./sidebarLwwMap.ts";
const sections = [{ id: "custom", name: "Work", order: 0 }];
test("default puts official Starred first and retains original custom/default positions", () => {
  assert.deepEqual(projectSectionOrder({}, sections), [
    "builtin:starred",
    "custom",
    "builtin:channels",
    "builtin:forums",
    "builtin:dms",
  ]);
});
test("DMs can move first and full order survives encrypted-lane codec and stale-device merge", () => {
  const original = SECTIONS_LANE.fromLegacy(
    { version: 1, sections, assignments: {} },
    (value) => [1, "0000000000000000", value],
  );
  const current = projectSections(original).layoutOrder;
  const edited = writeSectionOrder(original, current, [
    "builtin:dms",
    ...current,
  ]);
  assert.equal(projectSections(edited).layoutOrder[0], "builtin:dms");
  const decoded = decodeDoc(
    SECTIONS_LANE,
    encodeDoc(SECTIONS_LANE, edited),
    1000,
  );
  assert.deepEqual(
    projectSections(decoded.tree).layoutOrder,
    projectSections(edited).layoutOrder,
  );
  assert.deepEqual(
    projectSections(mergeTrees(edited, original)).layoutOrder,
    projectSections(edited).layoutOrder,
  );
  assert.deepEqual(projectSections(edited).sections, sections);
});
test("new sections append without overwriting authored order; deleted IDs disappear", () => {
  const original = projectSectionOrder({}, sections);
  const tree = writeSectionOrder({}, original, ["builtin:dms", ...original]);
  assert.equal(
    projectSectionOrder(tree, [
      ...sections,
      { id: "new", name: "New", order: 1 },
    ]).at(-1),
    "new",
  );
  assert.equal(projectSectionOrder(tree, []).includes("custom"), false);
});
test("Pin/Pinned offers match names exactly and disappear only after explicit handling", () => {
  const pin = [
    { id: "one", name: " Pin ", order: 0 },
    { id: "two", name: "PINNED", order: 1 },
    { id: "three", name: "Pinboard", order: 2 },
  ];
  assert.deepEqual(
    pinSectionOffers(pin, {}).map((s) => s.id),
    ["one", "two"],
  );
  assert.deepEqual(
    pinSectionOffers(pin, { one: true }).map((s) => s.id),
    ["two"],
  );
  assert.equal(pin.length, 3);
});

test("pending conversion survives wire codec and completion tombstone defeats stale intent", () => {
  const original = SECTIONS_LANE.fromLegacy(
    {
      version: 1,
      sections: [{ id: "pin", name: "Pin", order: 0 }],
      assignments: { channel: "pin" },
      pendingPinConversions: { pin: ["channel"] },
    },
    (value) => [1, "0000000000000000", value],
  );
  const decoded = decodeDoc(
    SECTIONS_LANE,
    encodeDoc(SECTIONS_LANE, original),
    1000,
  );
  assert.deepEqual(projectSections(decoded.tree).pendingPinConversions, {
    pin: ["channel"],
  });
  const complete = {
    ...original,
    m: { pin: [2000, "0000000000000000", true] },
    c: { pin: [2000, "0000000000000000", null] },
  };
  const view = projectSections(mergeTrees(complete, original));
  assert.deepEqual(view.pendingPinConversions, {});
  assert.equal(view.pinConversionHandled.pin, true);
  assert.equal(view.sections[0].name, "Pin");
  assert.equal(view.assignments.channel, "pin");
});

test("layout schema reads existing preferences but fences the current older writer", () => {
  const legacy = { version: 1, meta: { v: 1, s: {}, a: {} } };
  assert.ok(decodeDoc(SECTIONS_LANE, legacy, 1000));
  const next = encodeDoc(
    SECTIONS_LANE,
    writeSectionOrder({}, projectSectionOrder({}, []), ["builtin:dms"]),
  );
  assert.equal(next.meta.v, 2);
  const oldCodec = { ...SECTIONS_LANE, metaVersion: 1 };
  assert.equal(decodeDoc(oldCodec, next, 1000), null);
  assert.ok(decodeDoc(SECTIONS_LANE, next, 1000));
});

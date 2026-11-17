import assert from "node:assert/strict";
import test from "node:test";
import { groupSidebarChannels } from "./groupSidebarChannels.ts";
const channel = (id, name, channelType = "stream") => ({
  id,
  name,
  channelType,
});
const sections = [
  { id: "later", name: "Later", order: 1 },
  { id: "work", name: "Work", order: 0 },
];
test("ordered sections preserve channel objects and pin/navigation identity without mutating inputs", () => {
  const pinned = Object.freeze({
    ...channel("pinned", "Zulu"),
    pinnedMessageIds: ["message"],
  });
  const dm = Object.freeze(channel("dm", "DM", "dm"));
  const other = Object.freeze(channel("other", "Alpha"));
  const channels = Object.freeze([pinned, dm, other]);
  const prefs = Object.freeze({ pinned: "work", dm: "work" });
  const result = groupSidebarChannels(
    channels,
    sections,
    prefs,
    undefined,
    () => "alpha",
  );
  assert.deepEqual(
    result.groups.map((g) => g.section.id),
    ["work", "later"],
  );
  assert.equal(result.bySection.work[1], pinned);
  assert.equal(result.bySection.work[0], dm);
  assert.deepEqual(result.bySection.work[1].pinnedMessageIds, ["message"]);
  assert.deepEqual(result.unassigned, [other]);
  assert.deepEqual(result.directMessages, []);
  assert.deepEqual(
    sections.map((s) => s.id),
    ["later", "work"],
  );
});
test("unknown sections return DMs to their list; Starred and forums keep upstream placement", () => {
  const dm = channel("dm", "DM", "dm");
  const stream = channel("star", "Star");
  const forum = channel("forum", "Forum", "forum");
  const result = groupSidebarChannels(
    [dm, stream, forum],
    sections,
    { dm: "deleted", star: "work", forum: "work" },
    new Set(["star"]),
    () => "alpha",
  );
  assert.deepEqual(result.directMessages, [dm]);
  assert.deepEqual(result.unassigned, []);
  assert.equal(
    result.groups.every((g) => g.channels.length === 0),
    true,
  );
});
test("each section and default group use their existing sort mode", () => {
  const old = { ...channel("old", "Alpha"), lastMessageAt: "2026-11-10" };
  const fresh = { ...channel("fresh", "Zulu"), lastMessageAt: "2026-11-17" };
  const result = groupSidebarChannels(
    [old, fresh],
    sections,
    { old: "work", fresh: "work" },
    undefined,
    () => "recent",
  );
  assert.deepEqual(result.bySection.work, [fresh, old]);
});

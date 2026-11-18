import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  isJacobSidebarScope,
  decodeSidebarDefaults,
  upgradeDirectAgentsDefault,
} from "./jacobChannelSectionDefaults.ts";
import { SECTIONS_LANE, projectSections } from "./channelSectionsSync.ts";
import { LaneStore, decodeDoc, encodeDoc } from "./sidebarLaneStore.ts";
import { setRegs, mergeTrees } from "./sidebarLwwMap.ts";

const PK = "3eb6491e9fecd5e2c0221f76b79685a1478b591bf90ea155f5352ebe12672e1f";
const RELAY = "wss://jprojects.communities.buzz.xyz";
// Synthetic fixture only: real channel IDs live solely in the encrypted seed.
const payload = JSON.stringify({
  version: 1,
  sections: [
    { id: "projects", name: "Projects", order: 0 },
    { id: "paseo", name: "Paseo", order: 1 },
  ],
  assignments: { project: "projects", dm: "paseo" },
});
const storage = new Map();
globalThis.window ??= {};
window.localStorage = {
  getItem: (k) => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, v),
  removeItem: (k) => storage.delete(k),
};
beforeEach(() => storage.clear());
const device = () => new LaneStore(SECTIONS_LANE, PK, RELAY);
const seed = (store) =>
  store.transact((prev) => mergeTrees(decodeSidebarDefaults(payload), prev));

test("private bootstrap is enabled only for Jacob's exact community", () => {
  for (const pk of [
    PK,
    "38ba46f41d56ff5c71cfbfb856d00b209e6216a218260d2a30c4f1b712bdd1cb",
    "f".repeat(64),
    undefined,
  ]) {
    for (const relay of [RELAY, `${RELAY}/`, "wss://other.test", undefined]) {
      assert.equal(
        isJacobSidebarScope(pk, relay),
        pk === PK && Boolean(relay?.startsWith(RELAY)),
      );
    }
  }
});

test("seed persists and survives the actual sync codec without new IDs/stamps on reload", () => {
  const store = device();
  seed(store);
  const first = store.get();
  const reloaded = device();
  seed(reloaded);
  assert.deepEqual(reloaded.get(), first);
  assert.deepEqual(
    decodeDoc(SECTIONS_LANE, encodeDoc(SECTIONS_LANE, first), Date.now()).tree,
    first,
  );
});

test("remote changes beat defaults on fresh device in either merge order", () => {
  const first = device();
  seed(first);
  first.transact((tree) =>
    setRegs(tree, [
      [["s", "projects", "live"], false],
      [["s", "paseo", "name"], "Personal"],
      [["a", "dm"], null],
    ]),
  );
  const edited = first.get();
  storage.clear();
  const second = device();
  seed(second);
  const seeded = second.get();
  second.merge(edited);
  assert.deepEqual(second.get(), mergeTrees(edited, seeded));
  assert.equal(
    projectSections(second.get()).sections.some((s) => s.name === "Projects"),
    false,
  );
  assert.equal(projectSections(second.get()).sections[0].name, "Personal");
  assert.equal(projectSections(second.get()).assignments.dm, undefined);
  seed(second);
  assert.deepEqual(device().get(), second.get());
});

test("existing legacy assignments win over the baseline", () => {
  storage.set(
    SECTIONS_LANE.storageKey(PK, RELAY),
    JSON.stringify({
      version: 1,
      sections: [{ id: "mine", name: "Personal", order: 0 }],
      assignments: { dm: "mine" },
    }),
  );
  const store = device();
  seed(store);
  assert.equal(projectSections(store.get()).assignments.dm, "mine");
});

test("invalid/oversized bootstraps propagate an import error", () => {
  assert.throws(() => decodeSidebarDefaults("invalid"));
  assert.throws(() => decodeSidebarDefaults('{"version":99}'));
});

test("a delayed legacy relay head overrides bootstrap placeholders", () => {
  const store = device();
  seed(store);
  const remote = decodeDoc(
    SECTIONS_LANE,
    {
      version: 1,
      sections: [
        { id: "projects", name: "Renamed remotely", order: 0 },
        { id: "mine", name: "Personal", order: 1 },
      ],
      assignments: { dm: "mine" },
    },
    200000,
  );
  store.merge(remote.tree, remote.legacy);
  assert.equal(projectSections(store.get()).assignments.dm, "mine");
  assert.equal(
    projectSections(store.get()).sections.find((s) => s.id === "projects").name,
    "Renamed remotely",
  );
});

test("Direct agents updates only exact untouched seed section; authored edits and P2 survive", () => {
  const defaults = decodeSidebarDefaults(payload);
  const upgraded = upgradeDirectAgentsDefault(defaults, defaults);
  assert.equal(
    projectSections(upgraded).sections.find((s) => s.id === "paseo").name,
    "Direct agents",
  );
  assert.deepEqual(upgraded.a, defaults.a);
  assert.equal(
    projectSections(mergeTrees(upgraded, defaults)).sections.find(
      (s) => s.id === "paseo",
    ).name,
    "Direct agents",
  );
  assert.equal(upgradeDirectAgentsDefault(upgraded, defaults), upgraded);
  for (const [field, value] of [
    ["name", "My agents"],
    ["name", "Paseo"],
    ["order", 4],
    ["icon", "⭐"],
    ["live", false],
  ]) {
    const edited = setRegs(
      field === "name" && value === "Paseo"
        ? setRegs(defaults, [[["s", "paseo", "name"], "Temporary"]])
        : defaults,
      [[["s", "paseo", field], value]],
      true,
    );
    assert.equal(upgradeDirectAgentsDefault(edited, defaults), edited);
  }
  const unrelated = decodeSidebarDefaults(
    JSON.stringify({
      version: 1,
      sections: [{ id: "user", name: "Paseo", order: 0 }],
      assignments: {},
    }),
  );
  assert.equal(upgradeDirectAgentsDefault(unrelated, defaults), unrelated);
});

test("upgraded baseline yields to delayed legacy authored names in both orders and after persistence", () => {
  const defaults = decodeSidebarDefaults(payload);
  const importDefaults = (store) =>
    store.transact((prev) =>
      upgradeDirectAgentsDefault(mergeTrees(defaults, prev), defaults),
    );
  for (const authoredName of ["A", "My authored agents", "Paseo"]) {
    for (const legacyV of [1, 200000]) {
      for (const legacyFirst of [false, true]) {
        storage.clear();
        const remote = decodeDoc(
          SECTIONS_LANE,
          {
            version: 1,
            sections: [
              { id: "projects", name: "Projects", order: 0 },
              { id: "paseo", name: authoredName, order: 1 },
            ],
            assignments: { project: "projects", dm: "paseo" },
          },
          legacyV,
        );
        assert.equal(remote.legacy, true);
        let store = device();
        if (legacyFirst) store.merge(remote.tree, remote.legacy);
        importDefaults(store);
        // Exercise the actual encoded local tree, not an in-memory synthetic merge.
        store = device();
        if (!legacyFirst) store.merge(remote.tree, remote.legacy);
        importDefaults(store);
        assert.equal(
          projectSections(store.get()).sections.find((s) => s.id === "paseo")
            .name,
          authoredName,
          `${authoredName}; legacyFirst=${legacyFirst}`,
        );
        assert.equal(
          projectSections(device().get()).sections.find((s) => s.id === "paseo")
            .name,
          authoredName,
        );
        assert.equal(projectSections(store.get()).assignments.dm, "paseo");
        assert.deepEqual(device().get(), store.get());
      }
    }
  }
});

test("late legacy data still cannot replace genuinely authored modern section fields", () => {
  const defaults = decodeSidebarDefaults(payload);
  const store = device();
  store.transact(() => upgradeDirectAgentsDefault(defaults, defaults));
  store.transact((tree) =>
    setRegs(tree, [[["s", "paseo", "name"], "My current agents"]]),
  );
  const authored = store.get().s.paseo.name;
  const legacy = decodeDoc(
    SECTIONS_LANE,
    {
      version: 1,
      sections: [{ id: "paseo", name: "Late older name", order: 0 }],
      assignments: { dm: "paseo" },
    },
    Date.now() + 10000,
  );
  store.merge(legacy.tree, legacy.legacy);
  assert.deepEqual(store.get().s.paseo.name, authored);
  assert.equal(
    projectSections(device().get()).sections.find((s) => s.id === "paseo").name,
    "My current agents",
  );
});

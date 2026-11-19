import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  isJacobSidebarScope,
  decodeSidebarDefaults,
  projectDirectAgentSections,
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

test("Direct agents is only a view of the exact untouched seed, with no stored or encoded changes", () => {
  const defaults = decodeSidebarDefaults(payload);
  const before = JSON.stringify(encodeDoc(SECTIONS_LANE, defaults));
  const view = projectDirectAgentSections(defaults, defaults);
  assert.equal(
    view.sections.find((s) => s.id === "paseo").name,
    "Direct agents",
  );
  assert.equal(
    projectSections(defaults).sections.find((s) => s.id === "paseo").name,
    "Paseo",
  );
  assert.equal(JSON.stringify(encodeDoc(SECTIONS_LANE, defaults)), before);
  assert.deepEqual(view.assignments, projectSections(defaults).assignments);
  for (const [field, value] of [
    ["name", "My agents"],
    ["name", "Paseo"],
    ["order", 4],
    ["icon", "⭐"],
    ["live", false],
  ]) {
    const initial =
      field === "name" && value === "Paseo"
        ? setRegs(defaults, [[["s", "paseo", "name"], "Temporary"]])
        : defaults;
    const edited = setRegs(initial, [[["s", "paseo", field], value]], true);
    assert.deepEqual(
      projectDirectAgentSections(edited, defaults),
      projectSections(edited),
    );
  }
  assert.deepEqual(
    projectDirectAgentSections(defaults),
    projectSections(defaults),
  );
});

test("reviewer P1 repro: display default cannot fence a delayed legacy authored rename", () => {
  const defaults = decodeSidebarDefaults(
    JSON.stringify({
      version: 1,
      sections: [{ id: "paseo", name: "Paseo", order: 1 }],
      assignments: {},
    }),
  );
  const rawBefore = JSON.stringify(defaults);
  assert.equal(
    projectDirectAgentSections(defaults, defaults).sections[0].name,
    "Direct agents",
  );
  assert.equal(JSON.stringify(defaults), rawBefore);
  const remote = decodeDoc(
    SECTIONS_LANE,
    {
      version: 1,
      sections: [{ id: "paseo", name: "My authored agents", order: 1 }],
      assignments: {},
    },
    200000,
  );
  const merged = mergeTrees(defaults, remote.tree, remote.legacy);
  assert.equal(
    projectDirectAgentSections(merged, defaults).sections[0].name,
    "My authored agents",
  );
  assert.deepEqual(merged.s.paseo.name, [
    200000,
    "0".repeat(16),
    "My authored agents",
  ]);
});

test("view-only baseline preserves old-client names and rename-back in both arrival orders and after reload", () => {
  const defaults = decodeSidebarDefaults(payload);
  const importDefaults = (store) =>
    store.transact((prev) => mergeTrees(defaults, prev));
  for (const name of ["A", "My authored agents", "Paseo"]) {
    for (const legacyV of [1, 2, 200000]) {
      for (const legacyFirst of [false, true]) {
        storage.clear();
        const remote = decodeDoc(
          SECTIONS_LANE,
          {
            version: 1,
            sections: [
              { id: "projects", name: "Projects", order: 0 },
              { id: "paseo", name, order: 1 },
            ],
            assignments: { project: "projects", dm: "paseo" },
          },
          legacyV,
        );
        let store = device();
        if (legacyFirst) store.merge(remote.tree, remote.legacy);
        importDefaults(store);
        const before = JSON.stringify(encodeDoc(SECTIONS_LANE, store.get()));
        projectDirectAgentSections(store.get(), defaults);
        assert.equal(
          JSON.stringify(encodeDoc(SECTIONS_LANE, store.get())),
          before,
        );
        store = device();
        if (!legacyFirst) store.merge(remote.tree, remote.legacy);
        importDefaults(store);
        assert.equal(
          projectDirectAgentSections(store.get(), defaults).sections.find(
            (s) => s.id === "paseo",
          ).name,
          name,
        );
        assert.equal(
          projectDirectAgentSections(device().get(), defaults).sections.find(
            (s) => s.id === "paseo",
          ).name,
          name,
        );
        assert.deepEqual(device().get(), store.get());
      }
    }
  }
});

test("view default never changes existing authored fields or tombstones", () => {
  const defaults = decodeSidebarDefaults(payload);
  for (const value of ["Paseo", "My agents", null, false]) {
    const authored = {
      ...defaults,
      s: {
        ...defaults.s,
        paseo: { ...defaults.s.paseo, name: [1, "a".repeat(16), value] },
      },
    };
    const before = JSON.stringify(authored);
    projectDirectAgentSections(authored, defaults);
    assert.equal(JSON.stringify(authored), before);
  }
});

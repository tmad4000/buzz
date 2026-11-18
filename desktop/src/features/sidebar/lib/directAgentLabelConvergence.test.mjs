import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeSidebarDefaults,
  projectDirectAgentSections,
} from "./jacobChannelSectionDefaults.ts";
import { SECTIONS_LANE, projectSections } from "./channelSectionsSync.ts";
import { LaneStore, decodeDoc, encodeDoc } from "./sidebarLaneStore.ts";
import { canonical, mergeTrees, setRegs } from "./sidebarLwwMap.ts";
const PK = "a".repeat(64),
  RELAY = "wss://synthetic.invalid";
const legacy = (name) => ({
  version: 1,
  sections: [{ id: "seed", name, order: 0 }],
  assignments: { dm: "seed" },
});
const defaults = decodeSidebarDefaults(JSON.stringify(legacy("Paseo")));
let active;
globalThis.window ??= {};
window.localStorage = {
  getItem: (k) => active.get(k) ?? null,
  setItem: (k, v) => active.set(k, v),
  removeItem: (k) => active.delete(k),
};
function device(cache = new Map()) {
  let store;
  const run = (f) => {
    active = cache;
    return f();
  };
  const reload = () =>
    run(() => {
      store = new LaneStore(SECTIONS_LANE, PK, RELAY);
    });
  reload();
  return {
    run,
    reload,
    get: () => run(() => store.get()),
    edit: (f) => run(() => store.transact(f)),
    merge: (doc) => run(() => store.merge(doc.tree, doc.legacy)),
    bootstrap: () =>
      run(() => store.transact((tree) => mergeTrees(defaults, tree))),
    view: () =>
      run(() => {
        const before = canonical(encodeDoc(SECTIONS_LANE, store.get()));
        const view = projectDirectAgentSections(store.get(), defaults);
        assert.equal(
          canonical(encodeDoc(SECTIONS_LANE, store.get())),
          before,
          "display does not write a register",
        );
        return view;
      }),
  };
}
const label = (d) => d.view().sections[0]?.name;
function localLegacy(name) {
  const cache = new Map([
    [SECTIONS_LANE.storageKey(PK, RELAY), JSON.stringify(legacy(name))],
  ]);
  return device(cache).get(); // production LaneStore constructor assigns real legacy local-cache stamp1
}

test("lowest production legacy cache1 and relay1-second names win before/after bootstrap and survive reload", () => {
  for (const name of ["A", "My authored agents", "Paseo"]) {
    for (const doc of [
      { tree: localLegacy(name), legacy: true },
      decodeDoc(SECTIONS_LANE, legacy(name), 1 * 1000),
    ]) {
      for (const first of [false, true]) {
        const d = device();
        if (first) d.merge(doc);
        d.bootstrap();
        d.view();
        d.reload();
        if (!first) d.merge(doc);
        d.bootstrap();
        d.reload();
        assert.equal(
          label(d),
          name,
          `legacy stamp${doc.tree.s.seed.name[0]}, arrival${first ? "before" : "after"}`,
        );
        const bytes = canonical(encodeDoc(SECTIONS_LANE, d.get()));
        d.bootstrap();
        d.reload();
        assert.equal(label(d), name);
        assert.equal(canonical(encodeDoc(SECTIONS_LANE, d.get())), bytes);
      }
    }
  }
});

test("modern authored rename-back Paseo remains authored against bootstrap and later legacy heads", () => {
  for (const name of ["A", "My agents", "Paseo"]) {
    const d = device();
    d.bootstrap();
    d.edit((t) => setRegs(t, [[["s", "seed", "name"], "Temporary"]]));
    d.edit((t) => setRegs(t, [[["s", "seed", "name"], name]]));
    const before = canonical(d.get().s.seed.name);
    d.bootstrap();
    d.reload();
    d.merge(
      decodeDoc(SECTIONS_LANE, legacy("Late legacy"), Date.now() + 100000),
    );
    d.bootstrap();
    d.reload();
    assert.equal(label(d), name);
    assert.equal(canonical(d.get().s.seed.name), before);
  }
});

test("two independent modern devices bootstrap concurrently then exchange production documents without flip-flop", () => {
  const a = device(),
    b = device();
  a.bootstrap();
  b.bootstrap();
  const original = canonical(defaults);
  const document = (d) =>
    decodeDoc(SECTIONS_LANE, encodeDoc(SECTIONS_LANE, d.get()), Date.now());
  const exchange = () => {
    const at = document(a),
      bt = document(b);
    a.merge(bt);
    b.merge(at);
    a.reload();
    b.reload();
    a.bootstrap();
    b.bootstrap();
  };
  for (let i = 0; i < 8; i++) {
    exchange();
    assert.equal(label(a), "Direct agents");
    assert.equal(label(b), "Direct agents");
    assert.equal(canonical(a.get()), original);
    assert.equal(canonical(b.get()), original);
    assert.equal(projectSections(a.get()).sections[0].name, "Paseo");
  }
  a.edit((t) => setRegs(t, [[["s", "seed", "name"], "Temporary"]]));
  a.edit((t) => setRegs(t, [[["s", "seed", "name"], "Paseo"]]));
  for (let i = 0; i < 8; i++) {
    exchange();
    assert.equal(label(a), "Paseo");
    assert.equal(label(b), "Paseo");
    assert.equal(canonical(a.get()), canonical(b.get()));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import {
  registerSidebarLaneReadView,
  readSidebarLaneView,
  notifySidebarLaneReadViews,
} from "../sidebar/lib/sidebarLaneReadView.ts";
import { LaneStore, decodeDoc } from "../sidebar/lib/sidebarLaneStore.ts";
import { SECTIONS_LANE } from "../sidebar/lib/channelSectionsSync.ts";
import { setRegs } from "../sidebar/lib/sidebarLwwMap.ts";
import { readForwardSections, useForwardSections } from "./targets.ts";
const PK = "a".repeat(64),
  RELAY = "wss://test.invalid";
const seed = {
  version: 1,
  sections: [{ id: "agents", name: "Direct agents", order: 0 }],
  assignments: { dm: "agents", p2: "agents" },
};
test("picker live owner subscription sees additions without opening and failed-persistence removals", async () => {
  const dom = new JSDOM("<!doctype html>", { url: "http://localhost" });
  const data = new Map();
  let fail = false;
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (fail) throw Error("full");
      data.set(k, v);
    },
    removeItem: (k) => data.delete(k),
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.defineProperty(window, "localStorage", { value: storage });
  const { renderHook, act } = await import("@testing-library/react");
  const owner = new LaneStore(SECTIONS_LANE, PK, RELAY);
  owner.merge(decodeDoc(SECTIONS_LANE, seed, 200000).tree);
  const detach = registerSidebarLaneReadView(
      SECTIONS_LANE,
      PK,
      RELAY,
      owner,
      () => true,
    ),
    h = renderHook(() => useForwardSections(PK, RELAY));
  try {
    assert.deepEqual(h.result.current.assignments, seed.assignments);
    const stable = readSidebarLaneView(SECTIONS_LANE, PK, RELAY);
    assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY), stable);
    assert.equal(
      readSidebarLaneView(SECTIONS_LANE, PK, " WSS://TEST.INVALID/// "),
      stable,
    );
    fail = true;
    act(() =>
      owner.transact((t) => setRegs(t, [[["a", "project"], "agents"]])),
    );
    assert.equal(h.result.current.assignments.project, "agents");
    const persisted = [...data.values()][0];
    act(() => owner.transact((t) => setRegs(t, [[["a", "p2"], null]])));
    assert.equal(h.result.current.assignments.p2, undefined);
    assert.equal(readForwardSections(PK, RELAY).assignments.p2, undefined);
    assert.equal([...data.values()][0], persisted);
    act(() =>
      owner.transact((t) => setRegs(t, [[["s", "agents", "live"], false]])),
    );
    assert.deepEqual(readForwardSections(PK, RELAY).sections, []);
    assert.deepEqual(h.result.current.sections, []);
    assert.throws(
      () => readForwardSections("b".repeat(64), RELAY),
      /unavailable/,
    );
    assert.throws(
      () => readForwardSections(PK, "wss://other.invalid"),
      /unavailable/,
    );
    act(() => detach());
    assert.equal(h.result.current, undefined);
    assert.throws(() => readForwardSections(PK, RELAY), /unavailable/);
  } finally {
    h.unmount();
    detach();
    dom.window.close();
  }
});
test("cleanup is registration-specific, duplicate consumers preserve owner, ambiguous owners fail closed", () => {
  const first = { get: () => ({ first: true }), subscribe: () => () => {} },
    second = { get: () => ({ second: true }), subscribe: () => () => {} };
  const a = registerSidebarLaneReadView(
      SECTIONS_LANE,
      PK,
      RELAY,
      first,
      () => true,
    ),
    duplicate = registerSidebarLaneReadView(
      SECTIONS_LANE,
      PK,
      RELAY,
      first,
      () => true,
    );
  a();
  assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY).first, true);
  const b = registerSidebarLaneReadView(
    SECTIONS_LANE,
    PK,
    RELAY,
    second,
    () => true,
  );
  assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY), undefined);
  duplicate();
  assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY).second, true);
  a();
  assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY).second, true);
  b();
  assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY), undefined);
  const remounted = registerSidebarLaneReadView(
    SECTIONS_LANE,
    PK,
    RELAY,
    second,
    () => true,
  );
  b();
  assert.equal(readSidebarLaneView(SECTIONS_LANE, PK, RELAY).second, true);
  remounted();
});

test("owner hydration/decoding readiness gates cached/default assignments and notifies subscribed picker", async () => {
  const dom = new JSDOM("<!doctype html>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { renderHook, act } = await import("@testing-library/react");
  let ready = false;
  const tree = decodeDoc(SECTIONS_LANE, seed, 200000).tree,
    owner = { get: () => tree, subscribe: () => () => {} };
  const detach = registerSidebarLaneReadView(
    SECTIONS_LANE,
    PK,
    RELAY,
    owner,
    () => ready,
  );
  const h = renderHook(() => useForwardSections(PK, RELAY));
  try {
    assert.equal(h.result.current, undefined);
    assert.throws(() => readForwardSections(PK, RELAY), /unavailable/);
    act(() => {
      ready = true;
      notifySidebarLaneReadViews();
    });
    assert.deepEqual(h.result.current.assignments, seed.assignments);
    act(() => {
      ready = false;
      notifySidebarLaneReadViews();
    });
    assert.equal(h.result.current, undefined);
    assert.throws(() => readForwardSections(PK, RELAY), /unavailable/);
  } finally {
    h.unmount();
    detach();
    dom.window.close();
  }
});

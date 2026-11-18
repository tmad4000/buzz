import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useReadingRestoreAdmission } from "./useReadingRestoreAdmission.ts";

test("scroller leases retire on blur, coverage, owner return and teardown", async () => {
  const host = document.createElement("section");
  const scroller = document.createElement("div");
  host.append(scroller);
  document.body.append(host);
  const mount = document.createElement("div");
  document.body.append(mount);
  const root = createRoot(mount);
  const container = { current: scroller };
  const admitted = () => true;
  let ref;
  function Harness({ ownerKey }) {
    ref = useReadingRestoreAdmission(ownerKey, container, admitted);
    return null;
  }
  const render = async (ownerKey) =>
    act(() => root.render(React.createElement(Harness, { ownerKey })));
  let unmounted = false;
  try {
    await render("view-a:main:threads");
    const blurLease = ref.current.capture();
    assert.equal(blurLease(), true);
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
    assert.equal(blurLease(), false);
    const coveredLease = ref.current.capture();
    await act(async () => {
      host.setAttribute("inert", "");
      host.removeAttribute("inert");
      await Promise.resolve();
    });
    assert.equal(
      coveredLease(),
      false,
      "uncover without a frame cannot revive the old lease",
    );
    const oldOwner = ref.current;
    const oldLease = oldOwner.capture();
    await render("view-b:main:threads");
    assert.equal(oldLease(), false);
    await render("view-a:main:threads");
    assert.equal(
      oldOwner.capture()(),
      false,
      "returning to the same owner key creates a new lifetime",
    );
    const visibilityLease = ref.current.capture();
    document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(visibilityLease(), false);
    const retained = ref.current;
    await act(() => root.unmount());
    unmounted = true;
    assert.equal(ref.current, null);
    assert.equal(retained.capture()(), false);
  } finally {
    if (!unmounted) await act(() => root.unmount());
    host.remove();
    mount.remove();
  }
});

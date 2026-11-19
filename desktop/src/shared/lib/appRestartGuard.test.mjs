import assert from "node:assert/strict";
import test from "node:test";
import { allowAppRestart, registerAppRestartGuard } from "./appRestartGuard.ts";
test("restart checks every pane, rather than only the newest/focused guard", () => {
  const calls = [];
  const first = registerAppRestartGuard(() => {
    calls.push("background dirty Page");
    return false;
  });
  const second = registerAppRestartGuard(() => {
    calls.push("clean focused pane");
    return true;
  });
  try {
    assert.equal(allowAppRestart(), false);
    assert.deepEqual(calls, ["background dirty Page"]);
  } finally {
    first();
    second();
  }
  assert.equal(allowAppRestart(), true);
});
test("identical callbacks clean up by registration identity; exceptions fail closed", () => {
  const guard = () => {
    throw new Error("unavailable editor");
  };
  const first = registerAppRestartGuard(guard);
  const second = registerAppRestartGuard(guard);
  first();
  assert.equal(allowAppRestart(), false);
  second();
  assert.equal(allowAppRestart(), true);
});
test("a guard registered during the check cannot be silently missed", () => {
  let late;
  const first = registerAppRestartGuard(() => {
    late ??= registerAppRestartGuard(() => false);
    return true;
  });
  try {
    assert.equal(allowAppRestart(), false);
  } finally {
    first();
    late?.();
  }
});

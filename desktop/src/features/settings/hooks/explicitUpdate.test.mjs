import assert from "node:assert/strict";
import test from "node:test";
import { explicitUpdate } from "./explicitUpdate.ts";
function fixture() {
  const calls = [];
  const update = {
    version: "0.5.28-ideaflow.10",
    download: async () => calls.push("download+verify"),
    install: async () => calls.push("install"),
    close: async () => calls.push("close"),
  };
  let allowed = true;
  const controller = explicitUpdate(
    update,
    () => allowed,
    async () => calls.push("relaunch"),
    (phase, message) => calls.push([phase, message]),
  );
  return {
    update,
    calls,
    controller,
    allow: (value) => {
      allowed = value;
    },
  };
}
test("discovery does nothing; one explicit click verifies, installs and requests graceful restart in order", async () => {
  const f = fixture();
  assert.deepEqual(f.calls, []);
  await f.controller.start();
  assert.deepEqual(
    f.calls.filter((v) => typeof v === "string"),
    ["download+verify", "install", "relaunch"],
  );
});
test("unsaved guard veto before download keeps the running app untouched", async () => {
  const f = fixture();
  f.allow(false);
  await f.controller.start();
  assert.deepEqual(f.calls, [
    ["available", "Save or cancel your edits before restarting."],
  ]);
});
test("signature/download rejection never installs or restarts", async () => {
  const f = fixture();
  f.update.download = async () => {
    throw new Error("invalid signature");
  };
  await f.controller.start();
  assert.deepEqual(f.calls, [
    ["downloading", undefined],
    ["error", "invalid signature"],
  ]);
});
test("double clicks are single-flight and edits made during download veto installation", async () => {
  const f = fixture();
  let finish;
  f.update.download = () => {
    f.calls.push("download+verify");
    return new Promise((r) => {
      finish = r;
    });
  };
  const first = f.controller.start();
  await f.controller.start();
  assert.equal(f.calls.filter((v) => v === "download+verify").length, 1);
  f.allow(false);
  finish();
  await first;
  assert.equal(f.calls.includes("install"), false);
  assert.equal(f.calls.includes("relaunch"), false);
  f.allow(true);
  await f.controller.start();
  assert.deepEqual(
    f.calls.filter((v) => typeof v === "string"),
    ["download+verify", "install", "relaunch"],
  );
});
test("late edits during install veto restart; later explicit click restarts without reinstalling", async () => {
  const f = fixture();
  f.update.install = async () => {
    f.calls.push("install");
    f.allow(false);
  };
  await f.controller.start();
  assert.equal(f.calls.includes("relaunch"), false);
  assert.deepEqual(f.calls.at(-1), [
    "ready",
    "Save or cancel your edits before restarting.",
  ]);
  f.allow(true);
  await f.controller.start();
  assert.equal(f.calls.filter((v) => v === "install").length, 1);
  assert.equal(f.calls.filter((v) => v === "relaunch").length, 1);
});
test("install or restart failure cannot be reported as a successful automatic restart", async () => {
  const f = fixture();
  f.update.install = async () => {
    throw new Error("swap refused");
  };
  await f.controller.start();
  assert.deepEqual(f.calls.at(-1), ["error", "swap refused"]);
  assert.equal(f.calls.includes("relaunch"), false);
});
test("unmount during download closes the resource once and never installs or relaunches", async () => {
  const f = fixture();
  let finish;
  f.update.download = () =>
    new Promise((r) => {
      finish = r;
    });
  const started = f.controller.start();
  await f.controller.dispose();
  finish();
  await started;
  await f.controller.dispose();
  assert.equal(f.calls.includes("install"), false);
  assert.equal(f.calls.includes("relaunch"), false);
  assert.equal(f.calls.filter((v) => v === "close").length, 1);
});

test("rejected graceful restart keeps an explicit Restart action without reinstall or auto retry", async () => {
  const f = fixture();
  const controller = explicitUpdate(
    f.update,
    () => true,
    async () => {
      throw new Error("restart denied");
    },
    (phase, message) => f.calls.push([phase, message]),
  );
  await controller.start();
  assert.deepEqual(f.calls.at(-1), ["ready", "restart denied"]);
  assert.equal(f.calls.filter((v) => v === "install").length, 1);
  assert.equal(controller.busy, false);
});

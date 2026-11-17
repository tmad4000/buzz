import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceLifetime } from "./workspaceLifetime.ts";

test("same canonical scope keeps its controller while authorization config stays live", () => {
  const owner = new WorkspaceLifetime();
  let lease,
    created = 0;
  const create = (next) => {
    lease = next;
    created++;
    return { dispose() {} };
  };
  const a = owner.commit(
    "community/identity/main",
    { allowed: ["chat"] },
    create,
  );
  assert.equal(
    owner.commit("community/identity/main", { allowed: ["dm"] }, create),
    a,
  );
  assert.equal(created, 1);
  assert.deepEqual(lease.config().allowed, ["dm"]);
  owner.clear();
  assert.equal(lease.isCurrent(), false);
  assert.equal(lease.config(), null);
});

test("scope handoff flushes old storage before retirement and rejects old callbacks before disposal", () => {
  const owner = new WorkspaceLifetime(),
    events = [];
  let oldLease, newLease;
  owner.commit("a", { namespace: "a" }, (lease) => {
    oldLease = lease;
    return {
      flush() {
        events.push(["flush", lease.config().namespace, lease.isCurrent()]);
      },
      dispose() {
        events.push(["dispose", lease.isCurrent(), lease.config()]);
      },
    };
  });
  owner.commit("b", { namespace: "b" }, (lease) => {
    newLease = lease;
    events.push(["create", "b"]);
    return { dispose() {} };
  });
  assert.deepEqual(events, [
    ["flush", "a", true],
    ["dispose", false, null],
    ["create", "b"],
  ]);
  assert.equal(oldLease.isCurrent(), false);
  assert.equal(newLease.isCurrent(), true);
  owner.clear();
});

test("cleanup supports strict-mode replay without retaining a disposed controller", () => {
  const owner = new WorkspaceLifetime(),
    leases = [];
  let disposed = 0;
  const create = (lease) => {
    leases.push(lease);
    return {
      dispose() {
        disposed++;
      },
    };
  };
  const first = owner.commit("a", { ready: true }, create);
  owner.clear();
  owner.clear();
  const replay = owner.commit("a", { ready: true }, create);
  assert.notEqual(replay, first);
  assert.equal(disposed, 1);
  assert.equal(leases[0].isCurrent(), false);
  assert.equal(leases[1].isCurrent(), true);
  owner.clear();
});

test("failed construction and failed final flush retire their lease instead of leaking ownership", () => {
  const owner = new WorkspaceLifetime();
  let failedLease,
    disposed = 0;
  assert.throws(
    () =>
      owner.commit("a", { ready: true }, (lease) => {
        failedLease = lease;
        throw new Error("factory");
      }),
    /factory/,
  );
  assert.equal(failedLease.isCurrent(), false);
  let live;
  owner.commit("b", { ready: true }, (lease) => {
    live = lease;
    return {
      flush() {
        throw new Error("storage");
      },
      dispose() {
        disposed++;
      },
    };
  });
  assert.throws(() => owner.clear(), /storage/);
  assert.equal(live.isCurrent(), false);
  assert.equal(disposed, 1);
  owner.clear();
});

test("reentrant transition during a final flush fails closed without creating a second owner", () => {
  const owner = new WorkspaceLifetime();
  let attempts = 0;
  owner.commit("a", { ready: true }, () => ({
    flush() {
      assert.throws(
        () =>
          owner.commit("nested", { ready: true }, () => {
            attempts++;
            return { dispose() {} };
          }),
        /Reentrant/,
      );
    },
    dispose() {},
  }));
  owner.clear();
  assert.equal(attempts, 0);
});

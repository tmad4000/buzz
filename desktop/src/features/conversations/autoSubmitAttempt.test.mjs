import assert from "node:assert/strict";
import test from "node:test";
import { ConversationAutoSubmitAttempt } from "./autoSubmitAttempt.ts";

const target = () => ({
  scopeKey: "scope",
  viewId: "a",
  channelId: "chat",
  visit: 3,
  draftKey: "root",
  ownerId: "a-editor",
});
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("retirement inside initial admission cannot cross into trigger clearing", async () => {
  let attempt,
    clears = 0,
    sends = 0;
  attempt = new ConversationAutoSubmitAttempt({
    target: target(),
    admit: () => {
      attempt.retire();
      return true;
    },
    clearTrigger: async () => {
      clears++;
      return true;
    },
    submit: async () => {
      sends++;
    },
  });
  assert.equal(await attempt.run(), "ineligible");
  assert.deepEqual([clears, sends], [0, 0]);
});

test("retirement inside post-clear admission cannot cross into submit", async () => {
  let attempt,
    admissions = 0,
    clears = 0,
    sends = 0;
  attempt = new ConversationAutoSubmitAttempt({
    target: target(),
    admit: () => {
      if (++admissions === 2) attempt.retire();
      return true;
    },
    clearTrigger: async () => {
      clears++;
      return true;
    },
    submit: async () => {
      sends++;
    },
  });
  assert.equal(await attempt.run(), "ineligible");
  assert.deepEqual([clears, sends], [1, 0]);
});

test("command captures its target and awaits confirmed trigger clearing before normal submit", async () => {
  const original = target(),
    clearing = deferred(),
    submitted = [];
  const attempt = new ConversationAutoSubmitAttempt({
    target: original,
    admit: () => true,
    clearTrigger: async (captured) => {
      assert.equal(captured.draftKey, "root");
      return clearing.promise;
    },
    submit: async (captured) => {
      submitted.push(captured);
    },
  });
  original.viewId = "b";
  original.draftKey = "sibling";
  const running = attempt.run();
  assert.equal(submitted.length, 0);
  assert.equal(await attempt.run(), "already-attempted");
  clearing.resolve(true);
  assert.equal(await running, "submitted");
  assert.deepEqual(submitted, [target()]);
  assert.equal(Object.isFrozen(submitted[0]), true);
});

test("owner preview rejection stays consumed after takeover; clearing is not attempted", async () => {
  let eligible = false,
    clears = 0,
    sends = 0;
  const attempt = new ConversationAutoSubmitAttempt({
    target: target(),
    admit: () => eligible,
    clearTrigger: async () => {
      clears++;
      return true;
    },
    submit: async () => {
      sends++;
    },
  });
  assert.equal(await attempt.run(), "ineligible");
  eligible = true;
  assert.equal(await attempt.run(), "already-attempted");
  assert.deepEqual([clears, sends], [0, 0]);
});

test("retirement while clearing cannot replay on return; a fresh explicit command may proceed", async () => {
  const clearing = deferred();
  let sends = 0;
  const options = {
    target: target(),
    admit: () => true,
    clearTrigger: () => clearing.promise,
    submit: async () => {
      sends++;
    },
  };
  const attempt = new ConversationAutoSubmitAttempt(options);
  const running = attempt.run();
  attempt.retire();
  clearing.resolve(true);
  assert.equal(await running, "ineligible");
  assert.equal(sends, 0);
  assert.equal(await attempt.run(), "already-attempted");
  const explicitRetry = new ConversationAutoSubmitAttempt({
    ...options,
    clearTrigger: async () => true,
  });
  assert.equal(await explicitRetry.run(), "submitted");
  assert.equal(sends, 1);
});

test("failed trigger clearing never submits and submit failures cannot automatically retry", async () => {
  let sends = 0;
  for (const clearTrigger of [
    async () => false,
    async () => {
      throw new Error("route failed");
    },
  ]) {
    const attempt = new ConversationAutoSubmitAttempt({
      target: target(),
      admit: () => true,
      clearTrigger,
      submit: async () => {
        sends++;
      },
    });
    assert.equal(await attempt.run(), "clear-failed");
    assert.equal(await attempt.run(), "already-attempted");
  }
  const attempt = new ConversationAutoSubmitAttempt({
    target: target(),
    admit: () => true,
    clearTrigger: async () => true,
    submit: async () => {
      sends++;
      throw new Error("send failed");
    },
  });
  await assert.rejects(attempt.run(), /send failed/);
  assert.equal(await attempt.run(), "already-attempted");
  assert.equal(sends, 1);
});

import assert from "node:assert/strict";
import test from "node:test";
import { ConversationAutoSubmitCommands } from "./autoSubmitCommands.ts";

function setup(extra = {}) {
  let owner = "a-editor",
    current = true,
    sends = 0;
  const listeners = new Set();
  const commands = new ConversationAutoSubmitCommands({
    scopeKey: "scope",
    ownerForDraft: () => owner,
    isCurrent: () => current,
    subscribeInvalidation: (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    ...extra,
  });
  const target = {
    scopeKey: "scope",
    viewId: "a",
    channelId: "chat",
    visit: 1,
    draftKey: "root",
    ownerId: "a-editor",
  };
  const register = (patch = {}) =>
    commands.register({
      target: { ...target, ...patch },
      admit: () => true,
      submit: async () => {
        sends++;
      },
    });
  const request = (entryKey, patch = {}) =>
    commands.request({
      entryKey,
      viewId: "a",
      channelId: "chat",
      visit: 1,
      draftKey: "root",
      clearTrigger: async () => true,
      ...patch,
    });
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    commands,
    register,
    request,
    sends: () => sends,
    owner: (value) => {
      owner = value;
      notify();
    },
    current: (value) => {
      current = value;
      notify();
    },
    listeners,
  };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("missing/preview endpoints stay consumed after later mount or takeover", async () => {
  const h = setup();
  try {
    assert.equal(await h.request("unready"), "unavailable");
    h.register();
    assert.equal(await h.request("unready"), "already-issued");
    assert.equal(await h.request("preview", { viewId: "b" }), "unavailable");
    h.owner("b-editor");
    h.register({ viewId: "b", ownerId: "b-editor" });
    assert.equal(await h.request("preview", { viewId: "b" }), "already-issued");
    assert.equal(h.sends(), 0);
    assert.equal(
      await h.request("fresh-explicit", { viewId: "b" }),
      "submitted",
    );
    assert.equal(h.sends(), 1);
  } finally {
    h.commands.dispose();
  }
});
test("owner or view loss and return while clearing never replays the old command", async () => {
  for (const interrupt of [
    (h) => {
      h.owner("b-editor");
      h.owner("a-editor");
    },
    (h) => {
      h.current(false);
      h.current(true);
    },
  ]) {
    const h = setup(),
      clear = deferred();
    h.register();
    try {
      const running = h.request("entry", { clearTrigger: () => clear.promise });
      interrupt(h);
      clear.resolve(true);
      assert.equal(await running, "ineligible");
      assert.equal(h.sends(), 0);
      assert.equal(await h.request("entry"), "already-issued");
    } finally {
      h.commands.dispose();
    }
  }
});
test("canonical draft reservation prevents overlapping commands and never retries a busy entry", async () => {
  const h = setup(),
    clear = deferred();
  h.register();
  try {
    const running = h.request("one", { clearTrigger: () => clear.promise });
    assert.equal(await h.request("two"), "busy");
    clear.resolve(true);
    assert.equal(await running, "submitted");
    assert.equal(await h.request("two"), "already-issued");
    assert.equal(h.sends(), 1);
  } finally {
    h.commands.dispose();
  }
});
test("endpoint cleanup, blur retirement and disposal invalidate a pending command", async () => {
  for (const retire of [
    (_h, stop) => stop(),
    (h) => h.commands.retireAll(),
    (h) => h.commands.dispose(),
  ]) {
    const h = setup(),
      clear = deferred(),
      stop = h.register();
    const running = h.request("entry", { clearTrigger: () => clear.promise });
    retire(h, stop);
    clear.resolve(true);
    assert.equal(await running, "ineligible");
    assert.equal(h.sends(), 0);
    h.commands.dispose();
    assert.equal(h.listeners.size, 0);
    assert.equal(await h.request("new"), "disposed");
  }
});
test("bounded tombstones do not evict earlier entry claims", async () => {
  const h = setup({ entryLimit: 2 });
  try {
    assert.equal(await h.request("one"), "unavailable");
    assert.equal(await h.request("two"), "unavailable");
    h.register();
    assert.equal(await h.request("three"), "entry-limit");
    assert.equal(await h.request("one"), "already-issued");
    assert.equal(h.sends(), 0);
  } finally {
    h.commands.dispose();
  }
});

test("reentrant owner resolution cannot bypass canonical draft reservation", async () => {
  const clearing = deferred();
  let commands,
    reentered = false,
    inner,
    sends = 0,
    clears = 0;
  const request = (entryKey) =>
    commands.request({
      entryKey,
      viewId: "a",
      channelId: "chat",
      visit: 1,
      draftKey: "root",
      clearTrigger: () => {
        clears++;
        return clearing.promise;
      },
    });
  commands = new ConversationAutoSubmitCommands({
    scopeKey: "scope",
    isCurrent: () => true,
    ownerForDraft: () => {
      if (!reentered) {
        reentered = true;
        inner = request("inner");
      }
      return "a-editor";
    },
  });
  commands.register({
    target: {
      scopeKey: "scope",
      viewId: "a",
      channelId: "chat",
      visit: 1,
      draftKey: "root",
      ownerId: "a-editor",
    },
    admit: () => true,
    submit: async () => {
      sends++;
    },
  });
  try {
    assert.equal(await request("outer"), "busy");
    assert.equal(clears, 1);
    clearing.resolve(true);
    assert.equal(await inner, "submitted");
    assert.equal(sends, 1);
  } finally {
    commands.dispose();
  }
});

test("foreign scopes and ambiguous owner endpoints cannot be selected", async () => {
  const h = setup();
  try {
    h.register({ scopeKey: "foreign" });
    assert.equal(await h.request("foreign"), "unavailable");
    const stop = h.register();
    h.register();
    assert.equal(await h.request("ambiguous"), "unavailable");
    stop();
    assert.equal(await h.request("fresh"), "submitted");
    assert.equal(h.sends(), 1);
  } finally {
    h.commands.dispose();
  }
});

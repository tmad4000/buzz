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
    target,
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

test("retirement during initial owner resolution consumes the entry without clear or submit", async () => {
  for (const method of ["retireAll", "retireInvalid"]) {
    let commands,
      interrupted = false,
      clears = 0,
      sends = 0;
    commands = new ConversationAutoSubmitCommands({
      scopeKey: "scope",
      isCurrent: () => true,
      ownerForDraft: () => {
        if (!interrupted) {
          interrupted = true;
          commands[method]();
        }
        return "owner";
      },
    });
    commands.register({
      target: {
        scopeKey: "scope",
        viewId: "a",
        channelId: "chat",
        visit: 1,
        draftKey: "root",
        ownerId: "owner",
      },
      admit: () => true,
      submit: async () => {
        sends++;
      },
    });
    const request = (entryKey) =>
      commands.request({
        entryKey,
        viewId: "a",
        channelId: "chat",
        visit: 1,
        draftKey: "root",
        clearTrigger: async () => {
          clears++;
          return true;
        },
      });
    try {
      assert.equal(await request("interrupted"), "ineligible");
      assert.deepEqual([clears, sends], [0, 0]);
      assert.equal(await request("interrupted"), "already-issued");
      assert.equal(await request("fresh-explicit"), "submitted");
      assert.deepEqual([clears, sends], [1, 1]);
    } finally {
      commands.dispose();
    }
  }
});

test("endpoint retirement and replacement during lookup cannot revive the constructing request", async () => {
  let commands,
    stop,
    interrupted = false,
    sends = 0,
    clears = 0;
  const endpoint = {
    target: {
      scopeKey: "scope",
      viewId: "a",
      channelId: "chat",
      visit: 1,
      draftKey: "root",
      ownerId: "owner",
    },
    admit: () => true,
    submit: async () => {
      sends++;
    },
  };
  commands = new ConversationAutoSubmitCommands({
    scopeKey: "scope",
    isCurrent: () => true,
    ownerForDraft: () => {
      if (!interrupted) {
        interrupted = true;
        stop();
        commands.register(endpoint);
      }
      return "owner";
    },
  });
  stop = commands.register(endpoint);
  try {
    assert.equal(
      await commands.request({
        entryKey: "interrupted",
        viewId: "a",
        channelId: "chat",
        visit: 1,
        draftKey: "root",
        clearTrigger: async () => {
          clears++;
          return true;
        },
      }),
      "ineligible",
    );
    assert.deepEqual([clears, sends], [0, 0]);
  } finally {
    commands.dispose();
  }
});

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

test("request capture pins context and retires changed drafts without reviving them", async () => {
  const h = setup();
  const clear = deferred();
  let revision = 1;
  let context = "reply-a";
  const sent = [];
  h.commands.register({
    target: h.target,
    admit: () => true,
    submit: async () =>
      assert.fail("captured requests must use their pinned submit"),
    capture: () => {
      const capturedRevision = revision;
      const capturedContext = context;
      return {
        admit: () =>
          revision === capturedRevision && context === capturedContext,
        submit: async () => sent.push([capturedRevision, capturedContext]),
      };
    },
  });
  try {
    const running = h.request("first", { clearTrigger: () => clear.promise });
    revision++;
    h.current(true); // notify without changing view admission
    revision--;
    clear.resolve(true);
    assert.equal(await running, "ineligible");
    assert.deepEqual(sent, []);
    context = "reply-b";
    revision = 3;
    assert.equal(await h.request("explicit-new"), "submitted");
    assert.deepEqual(sent, [[3, "reply-b"]]);
  } finally {
    h.commands.dispose();
  }
});

test("capture has a draft reservation and cannot cross synchronous retirement", async () => {
  for (const interrupt of [false, true]) {
    const h = setup();
    let nested;
    let clears = 0;
    let submits = 0;
    h.commands.register({
      target: h.target,
      admit: () => true,
      submit: async () => assert.fail("uncaptured submit"),
      capture: () => {
        nested = h.request("nested");
        if (interrupt) h.commands.retireAll();
        return {
          admit: () => true,
          submit: async () => {
            submits++;
          },
        };
      },
    });
    try {
      assert.equal(
        await h.request("outer", {
          clearTrigger: async () => {
            clears++;
            return true;
          },
        }),
        interrupt ? "ineligible" : "submitted",
      );
      assert.equal(await nested, "busy");
      assert.equal(clears, interrupt ? 0 : 1);
      assert.equal(submits, interrupt ? 0 : 1);
    } finally {
      h.commands.dispose();
    }
  }
});

test("unready and throwing capture release reservation but never replay the entry", async () => {
  for (const throwing of [false, true]) {
    const h = setup();
    const stop = h.commands.register({
      target: h.target,
      admit: () => true,
      submit: async () => assert.fail("unready submit"),
      capture: () => {
        if (throwing) throw new Error("capture failed");
        return null;
      },
    });
    try {
      if (throwing) await assert.rejects(h.request("entry"), /capture failed/);
      else assert.equal(await h.request("entry"), "unavailable");
      stop();
      h.register();
      assert.equal(await h.request("entry"), "already-issued");
      assert.equal(await h.request("explicit-new"), "submitted");
      assert.equal(h.sends(), 1);
    } finally {
      h.commands.dispose();
    }
  }
});

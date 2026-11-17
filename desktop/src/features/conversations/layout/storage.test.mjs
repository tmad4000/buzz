import assert from "node:assert/strict";
import test from "node:test";
import {
  createConversationView,
  createSingleLayout,
  splitPane,
} from "./model.ts";
import { validateLayout, parseLayout } from "./schema.ts";
import {
  restoreLayout,
  saveLayout,
  layoutStorageKey,
  SESSION_ONLY_MESSAGE,
} from "./storage.ts";

const scope = {
  communityId: "community",
  identityPubkey: "identity",
  windowSlot: "main",
};
function fixture() {
  let n = 0;
  const ids = (kind) => `${kind}-${++n}`;
  const initial = createSingleLayout(createConversationView("chat", ids), ids);
  return splitPane(
    initial,
    initial.root.id,
    createConversationView("chat", ids),
    "horizontal",
    ids,
  );
}
function memory() {
  const entries = new Map();
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  };
}

test("round trip preserves duplicate resource views, ratios and scoped stable IDs", () => {
  const storage = memory();
  const layout = fixture();
  assert.equal(saveLayout(storage, scope, layout).saved, true);
  assert.deepEqual(restoreLayout(storage, scope), {
    layout,
    status: "restored",
  });
  for (const patch of [
    { communityId: "other" },
    { identityPubkey: "other" },
    { windowSlot: "other" },
  ]) {
    assert.equal(
      restoreLayout(storage, { ...scope, ...patch }).status,
      "empty",
    );
  }
  assert.notEqual(
    layoutStorageKey({ ...scope, communityId: "x:y", identityPubkey: "z" }),
    layoutStorageKey({ ...scope, communityId: "x", identityPubkey: "y:z" }),
  );
});

test("rejects unsupported/unsafe shape, graph identity violations and capability overflow", () => {
  const mutations = [
    (x) => {
      x.version = 2;
    },
    (x) => {
      x.root.sizes = [NaN, 0.5];
    },
    (x) => {
      x.root.sizes = [0, 1];
    },
    (x) => {
      x.root.sizes = [1];
    },
    (x) => {
      x.root.children[1].id = x.root.children[0].id;
    },
    (x) => {
      x.root.children[1].viewInstanceId = x.root.children[0].viewInstanceId;
    },
    (x) => {
      delete x.views[x.root.children[0].viewInstanceId];
    },
    (x) => {
      x.views[x.root.children[0].viewInstanceId].id = "mismatch";
    },
    (x) => {
      x.views[x.root.children[0].viewInstanceId].panelState.autoSend = "send";
    },
    (x) => {
      x.messageBody = "private";
    },
  ];
  for (const mutate of mutations) {
    const layout = fixture();
    mutate(layout);
    assert.equal(validateLayout(layout), null);
  }
  assert.equal(validateLayout(fixture(), 1), null);
  const cycle = fixture();
  cycle.root.children[1] = cycle.root;
  assert.equal(validateLayout(cycle), null);
  assert.equal(parseLayout("{broken"), null);
  assert.equal(parseLayout(" ".repeat(128 * 1024 + 1)), null);
});

test("normalizes single-child group and invalid focus without reallocating identity", () => {
  const layout = fixture();
  layout.root.children = [layout.root.children[0]];
  layout.root.sizes = [7];
  const retained = layout.root.children[0];
  layout.views = {
    [retained.viewInstanceId]: layout.views[retained.viewInstanceId],
  };
  layout.focusedPaneId = "closed";
  const normalized = validateLayout(layout);
  assert.deepEqual(normalized.root, retained);
  assert.equal(normalized.focusedPaneId, retained.id);
});

test("corrupt source remains recoverable; failed recovery backup never overwrites original", () => {
  const storage = memory();
  const key = layoutStorageKey(scope);
  storage.setItem(key, "{old-or-broken");
  assert.equal(restoreLayout(storage, scope).status, "recoverable");
  assert.equal(storage.entries.get(key), "{old-or-broken");
  const failing = {
    getItem: storage.getItem,
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.deepEqual(saveLayout(failing, scope, fixture()), {
    saved: false,
    message: SESSION_ONLY_MESSAGE,
  });
  assert.equal(storage.entries.get(key), "{old-or-broken");
  storage.setItem("canonical-draft", "retain me");
  assert.equal(saveLayout(storage, scope, fixture()).saved, true);
  assert.equal(storage.entries.get(`${key}:recovery`), "{old-or-broken");
  assert.equal(storage.entries.get("canonical-draft"), "retain me");
});

test("unavailable storage returns session-only state without throwing or discarding local layout", () => {
  const storage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(restoreLayout(storage, scope).status, "unavailable");
  const layout = fixture();
  assert.equal(
    saveLayout(storage, scope, layout).message,
    SESSION_ONLY_MESSAGE,
  );
  assert.equal(layout.root.children.length, 2);
});

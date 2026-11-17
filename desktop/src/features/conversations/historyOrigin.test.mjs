import assert from "node:assert/strict";
import test from "node:test";
import { ConversationHistoryOrigins } from "./historyOrigin.ts";

function setup() {
  const subscribers = new Set();
  const history = {
    location: {
      state: {
        __TSR_key: "boot",
        buzzConversationView: { viewInstanceId: "copied" },
      },
    },
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  };
  const origins = new ConversationHistoryOrigins(history);
  const emit = (type, key) => {
    history.location = {
      state: {
        __TSR_key: key,
        buzzConversationView: { viewInstanceId: "copied" },
      },
    };
    for (const listener of subscribers)
      listener({ location: history.location, action: { type } });
  };
  return { origins, emit, subscribers };
}

test("cold boot and fresh navigation ignore copied metadata as an origin signal", () => {
  const { origins, emit } = setup();
  assert.deepEqual(origins.getSnapshot(), {
    entryKey: "boot",
    traversal: false,
  });
  const stop = origins.subscribe(() => {});
  for (const type of ["PUSH", "REPLACE"]) {
    emit(type, type);
    assert.deepEqual(origins.getSnapshot(), {
      entryKey: type,
      traversal: false,
    });
  }
  stop();
});

test("only observed Back/Forward/Go admit history targeting, including returning to an old entry key", () => {
  const { origins, emit } = setup();
  const stop = origins.subscribe(() => {});
  for (const type of ["BACK", "FORWARD", "GO"]) {
    emit(type, "boot");
    assert.deepEqual(origins.getSnapshot(), {
      entryKey: "boot",
      traversal: true,
    });
  }
  stop();
});

test("subscription cleanup retires observers; resubscription catches a new external entry", () => {
  const { origins, emit, subscribers } = setup();
  const a = origins.subscribe(() => {}),
    b = origins.subscribe(() => {});
  assert.equal(subscribers.size, 1);
  a();
  assert.equal(subscribers.size, 1);
  b();
  assert.equal(subscribers.size, 0);
  emit("PUSH", "new");
  const stop = origins.subscribe(() => {});
  assert.deepEqual(origins.getSnapshot(), {
    entryKey: "new",
    traversal: false,
  });
  stop();
});

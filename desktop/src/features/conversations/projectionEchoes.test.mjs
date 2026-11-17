import assert from "node:assert/strict";
import test from "node:test";
import { ConversationProjectionEchoes } from "./projectionEchoes.ts";

const actual = {
  scopeKey: "scope",
  viewId: "a",
  channelId: "chat",
  panelState: { messageId: "m" },
};
test("only the registered outgoing projection's bound entry is consumed once", () => {
  const echoes = new ConversationProjectionEchoes();
  echoes.expect("nonce", actual, {});
  echoes.bindHistoryEntry("nonce", "outgoing-entry");
  assert.equal(echoes.consume("nonce", "outgoing-entry", actual), true);
  assert.equal(echoes.consume("nonce", "outgoing-entry", actual), false);
});
test("copied metadata on a distinct explicit entry cannot rebind an outgoing projection", () => {
  const echoes = new ConversationProjectionEchoes();
  echoes.expect("nonce", actual, {});
  echoes.bindHistoryEntry("nonce", "outgoing-entry");
  echoes.bindHistoryEntry("nonce", "explicit-entry");
  assert.equal(echoes.consume("nonce", "explicit-entry", actual), false);
});
test("unbound, retired and mismatched scope/view/panel projections fail closed", () => {
  const echoes = new ConversationProjectionEchoes(),
    owner = {};
  echoes.expect("unbound", actual, owner);
  assert.equal(echoes.consume("unbound", "entry", actual), false);
  for (const change of [
    { scopeKey: "other" },
    { viewId: "b" },
    { panelState: {} },
  ]) {
    echoes.expect("nonce", actual, owner);
    echoes.bindHistoryEntry("nonce", "entry");
    assert.equal(
      echoes.consume("nonce", "entry", { ...actual, ...change }),
      false,
    );
  }
  echoes.expect("retired", actual, owner);
  echoes.bindHistoryEntry("retired", "entry");
  echoes.cancelOwner(owner);
  assert.equal(echoes.consume("retired", "entry", actual), false);
});

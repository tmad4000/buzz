import assert from "node:assert/strict";
import test from "node:test";
import {
  autoSendPermitsFor,
  withAutoSendPermitState,
  autoSendPermitToken,
  autoSendEntryFromHref,
  bindAutoSendHistoryEntry,
} from "./autoSendNavigation.ts";

test("permit history state is additive for confirmation and cleared on ordinary navigation", () => {
  const previous = { searchHighlight: { activationId: "same" }, unrelated: 42 };
  const tagged = withAutoSendPermitState(previous, "confirmed");
  assert.equal(autoSendPermitToken(tagged), "confirmed");
  assert.equal(tagged.searchHighlight, previous.searchHighlight);
  assert.equal(tagged.unrelated, 42);
  assert.equal(autoSendPermitToken(previous), null);
  assert.equal(
    autoSendPermitToken(withAutoSendPermitState(tagged, null)),
    null,
  );
  for (const state of [
    null,
    {},
    { buzzConversationAutoSend: "confirmed" },
    { buzzConversationAutoSend: { version: 2, token: "confirmed" } },
    { buzzConversationAutoSend: { version: 1, token: "" } },
  ])
    assert.equal(autoSendPermitToken(state), null);
});

test("actual href parsing accepts canonical encoded drafts and rejects ambiguous/malformed targets", () => {
  assert.deepEqual(
    autoSendEntryFromHref(
      "/channels/chat?thread=root&autoSend=thread%3Aroot#message",
    ),
    { channelId: "chat", draftKey: "thread:root" },
  );
  for (const href of [
    "/home?autoSend=draft",
    "/channels/chat",
    "/channels/chat?autoSend=",
    "/channels/chat?autoSend=a&autoSend=b",
    "/channels/%ZZ?autoSend=a",
    "/channels/chat/extra?autoSend=a",
  ])
    assert.equal(autoSendEntryFromHref(href), null);
});

test("actual history binding is router-local and requires the armed channel/draft and fresh action", () => {
  const history = {},
    otherHistory = {};
  const permits = autoSendPermitsFor(history);
  assert.equal(autoSendPermitsFor(history), permits);
  assert.notEqual(autoSendPermitsFor(otherHistory), permits);
  const stop = permits.bindScope("scope", () => true);
  const entry = {
    scopeKey: "scope",
    key: "actual",
    channelId: "chat",
    draftKey: "thread:root",
    fresh: true,
    projectionEcho: false,
  };
  try {
    const token = permits.arm("chat", "thread:root");
    const state = withAutoSendPermitState({ __TSR_key: "actual" }, token);
    assert.equal(
      bindAutoSendHistoryEntry(
        permits,
        { href: "/channels/chat?autoSend=thread%3Aroot", state },
        "PUSH",
      ),
      true,
    );
    assert.ok(permits.consume(token, entry));
    assert.equal(autoSendPermitsFor(otherHistory).consume(token, entry), null);
    for (const [href, action] of [
      ["/channels/other?autoSend=thread%3Aroot", "PUSH"],
      ["/channels/chat?autoSend=other", "REPLACE"],
      ["/channels/chat?autoSend=thread%3Aroot", "BACK"],
      ["/channels/chat?autoSend=thread%3Aroot&autoSend=other", "PUSH"],
    ]) {
      const denied = permits.arm("chat", "thread:root");
      const deniedState = withAutoSendPermitState(
        { __TSR_key: "actual" },
        denied,
      );
      assert.equal(
        bindAutoSendHistoryEntry(permits, { href, state: deniedState }, action),
        false,
      );
      assert.equal(permits.consume(denied, entry), null);
    }
  } finally {
    stop();
  }
});

test("foreground retirement discards pending permissions without reviving cancelled nonces", () => {
  const permits = autoSendPermitsFor({});
  const stop = permits.bindScope("scope", () => true);
  try {
    const token = permits.arm("chat", "draft");
    permits.retirePending();
    assert.equal(
      bindAutoSendHistoryEntry(
        permits,
        {
          href: "/channels/chat?autoSend=draft",
          state: withAutoSendPermitState({ __TSR_key: "actual" }, token),
        },
        "REPLACE",
      ),
      false,
    );
    assert.ok(permits.arm("chat", "draft"));
  } finally {
    stop();
  }
});

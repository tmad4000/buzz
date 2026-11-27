import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { requestDraftAddressSeed } from "@/features/messages/lib/draftAddressSeeds";
import {
  clearAllDrafts,
  initDraftStore,
  loadDraftEntry,
  persistDraftEntry,
} from "@/features/messages/lib/useDrafts";
import { useDraftPersistLifecycle } from "@/features/messages/ui/useDraftPersistSnapshot";

const AGENT = "a".repeat(64);

// Mounts the real draft lifecycle the way MessageComposer wires it, in a host
// that owns a Telegram-style reply target (stubbed on this base; the captain
// reruns this on the combined 11.4 head where replies are real).
test("an address seed keeps an active reply target and inserts at position 0", async () => {
  initDraftStore("synthetic-owner", "wss://seed-reply-test.invalid");
  clearAllDrafts();
  persistDraftEntry("chan", "hello there", "chan", [], [], []);

  const editor = { doc: "", inserts: [], setContentCalls: 0 };
  let refs = [];
  const cancelReply = [];
  let observedReplyTarget = null;

  function Composer() {
    const [replyTarget, setReplyTarget] = React.useState({
      id: "msg-1",
      author: "Ava",
    });
    observedReplyTarget = replyTarget;
    const spoileredAttachmentUrlsRef = React.useRef(new Set());
    useDraftPersistLifecycle({
      effectiveDraftKey: "chan",
      channelId: "chan",
      loadDraft: loadDraftEntry,
      persistDraft: persistDraftEntry,
      getMentionRefs: () => refs,
      restoreMentionRefs: (next) => {
        refs = [...next];
      },
      livePendingImeta: [],
      setPendingImeta: () => {},
      setContent: (content) => {
        editor.setContentCalls += 1;
        editor.doc = content;
      },
      clearContent: () => {
        editor.doc = "";
      },
      setSpoileredAttachmentUrls: () => {},
      spoileredAttachmentUrlsRef,
      syncComposerContentFromEditor: () => editor.doc,
      // Same shape as MessageComposer: a literal insert at plain-text offset 0.
      insertLeadingText: (text) => {
        editor.inserts.push({ offset: 0, text });
        editor.doc = `${text}${editor.doc}`;
      },
      addressSeedReady: true,
    });
    // Any reply-cancel path a composer has (e.g. Escape) records here.
    React.useEffect(() => {
      if (replyTarget === null) cancelReply.push("cleared");
    }, [replyTarget]);
    void setReplyTarget;
    return null;
  }

  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(React.createElement(Composer)));
  assert.equal(editor.doc, "hello there", "draft restored before seeding");

  await act(async () => {
    requestDraftAddressSeed("chan", { pubkey: AGENT, displayName: "Agent" });
  });

  assert.deepEqual(editor.inserts, [{ offset: 0, text: "@Agent " }]);
  assert.equal(editor.doc, "@Agent hello there");
  assert.equal(editor.setContentCalls, 1, "only the initial restore");
  assert.deepEqual(refs, [
    { displayName: "Agent", pubkey: AGENT, isAgent: true },
  ]);
  assert.deepEqual(observedReplyTarget, { id: "msg-1", author: "Ava" });
  assert.deepEqual(cancelReply, []);

  await act(async () => root.unmount());
  clearAllDrafts();
});

// Source guard, rerunnable on the combined head: the seed path inserts at 0
// and never touches reply-target state.
test("MessageComposer wires the seed as a position-0 literal insert, independent of replyTarget", () => {
  const composer = fs.readFileSync(
    new URL("./MessageComposer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    composer,
    /insertLeadingText: \(text\) => richText\.replacePlainTextRange\(0, 0, text\)/,
  );
  const lifecycle = fs.readFileSync(
    new URL("./useDraftPersistSnapshot.ts", import.meta.url),
    "utf8",
  );
  const seedPath = lifecycle.slice(lifecycle.indexOf("applyAddressSeedRef"));
  assert.doesNotMatch(seedPath, /replyTarget|ReplyTarget|cancelReply/);
});

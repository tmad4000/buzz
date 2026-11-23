import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useTimelineInPlaceReply } from "./useTimelineInPlaceReply.ts";

const message = (id, extra = {}) => ({
  id,
  author: "Bob",
  body: `body of ${id}`,
  depth: 0,
  createdAt: 1,
  ...extra,
});

async function mounted(run) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    CSS: { escape: (value) => value },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const frames = [];
  globalThis.requestAnimationFrame = (callback) => frames.push(callback);
  globalThis.cancelAnimationFrame = () => {};
  const root = createRoot(dom.window.document.getElementById("root"));
  const state = {
    sends: [],
    reject: null,
    jumps: [],
    prepared: [],
    reached: 0,
  };
  const container = dom.window.document.createElement("div");
  const timelineRef = {
    current: {
      prepareSentJump: (id) => state.prepared.push(id),
      jumpToSentMessage: (id) => {
        state.jumps.push(id);
        return state.jumps.length >= state.reached && state.reached > 0;
      },
      getReadingContainer: () => container,
    },
  };
  const onSend = async (...args) => {
    state.sends.push(args);
    if (state.gate) await state.gate;
    if (state.reject) throw state.reject;
    return { id: "sent" };
  };
  let hook;
  function Probe({ channelId }) {
    hook = useTimelineInPlaceReply({
      channelId,
      flatTimeline: true,
      onSend,
      scope: `relay:me:${channelId}`,
      timelineRef,
    });
    return null;
  }
  const render = (channelId, key) =>
    act(() => root.render(React.createElement(Probe, { channelId, key })));
  await render("general", "a");
  const api = {
    get hook() {
      return hook;
    },
    state,
    render,
    win: dom.window,
    frame: () => act(() => frames.splice(0).forEach((f) => void f(0))),
  };
  try {
    await run(api);
  } finally {
    await act(() => root.unmount());
    dom.window.close();
  }
}

test("in-place reply captures the exact parent and canonical root, then clears on send", () =>
  mounted(async (t) => {
    assert.equal(t.hook.composerProps.onCaptureSendContext(), null);
    await act(() => t.hook.start(message("nested", { rootId: "root" })));
    assert.equal(t.hook.composerProps.replyTarget.author, "Bob");
    const context = t.hook.composerProps.onCaptureSendContext();
    assert.deepEqual(context, {
      parentEventId: "nested",
      threadHeadId: "root",
    });
    await act(() =>
      t.hook.composerProps.onSend("hi", [], undefined, "general", context),
    );
    assert.deepEqual(t.state.sends[0][4], { ...context, inTimeline: true });
    assert.equal(t.hook.composerProps.replyTarget, null);
    assert.equal(t.win.localStorage.length, 0);
  }));

test("replying to a root uses it as both parent and root", () =>
  mounted(async (t) => {
    await act(() => t.hook.start(message("root")));
    assert.deepEqual(t.hook.composerProps.onCaptureSendContext(), {
      parentEventId: "root",
      threadHeadId: "root",
    });
  }));

test("the target follows its channel draft across switches and remounts", () =>
  mounted(async (t) => {
    await act(() => t.hook.start(message("nested", { rootId: "root" })));
    await t.render("random", "a");
    assert.equal(t.hook.composerProps.replyTarget, null);
    assert.equal(t.hook.composerProps.onCaptureSendContext(), null);
    await t.render("general", "a");
    assert.equal(t.hook.composerProps.replyTarget.id, "nested");
    await t.render("general", "remounted");
    assert.equal(t.hook.composerProps.replyTarget.id, "nested");
  }));

test("a failed send restores its parent, but never over a newer choice", () =>
  mounted(async (t) => {
    t.state.reject = new Error("offline");
    await act(() => t.hook.start(message("first")));
    const context = t.hook.composerProps.onCaptureSendContext();
    const send = () =>
      t.hook.composerProps.onSend("hi", [], undefined, "general", context);
    await act(() => assert.rejects(send(), /offline/));
    assert.equal(t.hook.composerProps.replyTarget.id, "first");
    await act(async () => {
      const pending = send();
      t.hook.start(message("second"));
      await assert.rejects(pending, /offline/);
    });
    assert.equal(t.hook.composerProps.replyTarget.id, "second");
  }));

test("a reply cannot leave its conversation and stays available after refusal", () =>
  mounted(async (t) => {
    await act(() => t.hook.start(message("root")));
    const context = t.hook.composerProps.onCaptureSendContext();
    await act(() =>
      assert.rejects(
        t.hook.composerProps.onSend("hi", [], undefined, "new-dm", context),
        /current conversation/,
      ),
    );
    assert.equal(t.state.sends.length, 0);
    assert.equal(t.hook.composerProps.replyTarget.id, "root");
  }));

test("a send failing after a channel switch restores only its own channel", () =>
  mounted(async (t) => {
    await act(() => t.hook.start(message("first")));
    const context = t.hook.composerProps.onCaptureSendContext();
    let fail;
    t.state.gate = new Promise((_, reject) => {
      fail = reject;
    });
    let settled;
    await act(() => {
      settled = assert.rejects(
        t.hook.composerProps.onSend("hi", [], undefined, "general", context),
        /offline/,
      );
    });
    await t.render("random", "a");
    await act(() => t.hook.start(message("other")));
    await act(async () => {
      fail(new Error("offline"));
      await settled;
    });
    assert.equal(t.hook.composerProps.replyTarget.id, "other");
    await t.render("general", "a");
    assert.equal(t.hook.composerProps.replyTarget.id, "first");
    await t.render("random", "a");
    assert.equal(t.hook.composerProps.replyTarget.id, "other");
  }));

test("the cancel control clears the target; pending rows cannot become one", () =>
  mounted(async (t) => {
    await act(() => t.hook.start(message("root", { pending: true })));
    await act(() => t.hook.start(message("outbox-local:1")));
    assert.equal(t.hook.composerProps.replyTarget, null);
    await act(() => t.hook.start(message("root")));
    await act(() => t.hook.composerProps.onCancelReply());
    assert.equal(t.hook.composerProps.replyTarget, null);
  }));

test("quote jump retries until the row is realized, and reports an absent row", () =>
  mounted(async (t) => {
    t.state.reached = 3;
    await act(() => t.hook.jump("root"));
    for (let i = 0; i < 40; i++) await t.frame();
    // Two misses, then held while late row measurements settle.
    assert.equal(t.state.jumps.length, 14);
    assert.ok(t.state.jumps.every((id) => id === "root"));
    assert.deepEqual(t.state.prepared, ["root", null]);
    t.state.reached = 0;
    t.state.jumps.length = 0;
    let unavailable = 0;
    await act(() => t.hook.jump("gone", () => unavailable++));
    for (let i = 0; i < 120; i++) await t.frame();
    assert.equal(unavailable, 1);
    assert.equal(t.state.jumps.length, 90);
  }));

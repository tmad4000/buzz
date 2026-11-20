import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { useAnchoredScroll } from "./useAnchoredScroll.ts";
import { useVirtualizedBottomSettle } from "./useVirtualizedBottomSettle.ts";
import {
  captureReadingPosition,
  restoreReadingPosition,
} from "./timelineReadingPosition.ts";

// Execute MessageTimeline's actual public ref binding, composed with the real
// anchored-scroll and virtualizer-ownership hooks. Only browser geometry and
// the VList physical handle are modeled; this does not claim browser hit tests.
const source = ts.createSourceFile(
  "MessageTimeline.tsx",
  readFileSync(new URL("./MessageTimeline.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let binding;
let anchoredCall;
function visit(node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === "React.useImperativeHandle"
  )
    binding = node.getText(source);
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === "useAnchoredScroll"
  )
    anchoredCall = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(binding);
assert.ok(anchoredCall);
// Execute the production adapter too: hand-constructing hook options could let
// a dropped virtualSettleAtBottom or reading guard pass this regression.
const useTimelineAnchoredScroll = new Function(
  "useAnchoredScroll",
  "channelId",
  "contentRef",
  "showTimelineSkeleton",
  "renderedMessages",
  "onTargetReached",
  "activeScrollContainerRef",
  "splitThreadPanelOpen",
  "targetMessageId",
  "timelineVirtualizerApi",
  "useTimelineVirtualizer",
  "virtualizerRenderVersion",
  `return ${ts.transpile(anchoredCall, { target: ts.ScriptTarget.ES2022, alwaysStrict: false }).trim().replace(/;$/, "")}`,
);
const listSource = ts.createSourceFile(
  "TimelineMessageList.tsx",
  readFileSync(new URL("./TimelineMessageList.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let listApi;
function visitList(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(listSource) === "api" &&
    node.initializer &&
    node.type?.getText(listSource) === "TimelineVirtualizerApi"
  )
    listApi = node.initializer.getText(listSource);
  ts.forEachChild(node, visitList);
}
visitList(listSource);
assert.ok(listApi);
const createListApi = new Function(
  "cancelBottomSettle",
  "jumpToBottom",
  "settleAtBottom",
  "preserveReadingPosition",
  "isBottomPinned",
  "messageItemIndexByIdRef",
  "listRef",
  `return ${ts.transpile(`(${listApi})`, { target: ts.ScriptTarget.ES2022, alwaysStrict: false }).trim().replace(/;$/, "")}`,
);
const useTimelineHandle = new Function(
  "React",
  "ref",
  "activeScrollContainerRef",
  "messages",
  "timelineVirtualizerApi",
  "prepareForOwnMessage",
  "settleAtBottomAfterLayout",
  "setSentJumpId",
  "scrollToMessage",
  "captureReadingPosition",
  "restoreReadingPosition",
  ts.transpile(binding, { target: ts.ScriptTarget.ES2022 }),
);
if (!globalThis.CSS) globalThis.CSS = { escape: (value) => value };

function rect(top, height = 40) {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 600,
    width: 600,
    x: 0,
    y: top,
  };
}

async function mount({ targetMessageId } = {}) {
  const prior = {
    resize: globalThis.ResizeObserver,
    raf: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  const observers = [];
  const frames = new Map();
  let frameId = 0;
  globalThis.ResizeObserver = class {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }
    observe(node) {
      this.nodes ??= [];
      this.nodes.push(node);
    }
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const model = {
    top: 0,
    height: 1600,
    viewport: 400,
    shift: 0,
    shiftFrom: Infinity,
    pins: 0,
  };
  const host = document.createElement("div"),
    scroller = document.createElement("div"),
    content = document.createElement("div");
  host.append(scroller);
  scroller.append(content);
  document.body.append(host);
  Object.defineProperties(scroller, {
    scrollTop: {
      get: () => model.top,
      set: (value) => {
        model.top = Math.max(0, Math.min(value, model.height - model.viewport));
      },
    },
    scrollHeight: { get: () => model.height },
    clientHeight: { get: () => model.viewport },
  });
  scroller.getBoundingClientRect = () => rect(0, model.viewport);
  scroller.scrollTo = ({ top }) => {
    scroller.scrollTop = top;
  };
  scroller.scrollBy = (_x, y) => {
    scroller.scrollTop += y;
  };
  const rows = Array.from({ length: 40 }, (_, index) => {
    const row = document.createElement("article");
    row.dataset.messageId = `row-${index}`;
    row.dataset.messageRenderKey = `row-${index}`;
    row.getBoundingClientRect = () =>
      rect(
        index * 40 + (index >= model.shiftFrom ? model.shift : 0) - model.top,
      );
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Reply";
    row.append(button);
    content.append(row);
    return row;
  });
  const hostRef = { current: host },
    scrollRef = { current: scroller },
    itemCount = { current: 41 },
    timelineRef = { current: null },
    anchoredRef = { current: null },
    apiRef = { current: null };
  const listRef = {
    current: {
      get scrollSize() {
        return model.height;
      },
      get viewportSize() {
        return model.viewport;
      },
      get scrollOffset() {
        return model.top;
      },
      scrollToIndex(index, options) {
        if (options?.align === "center") {
          scroller.scrollTop = index * 40 - (model.viewport - 40) / 2;
        } else {
          model.pins++;
          scroller.scrollTop = model.height - model.viewport;
        }
      },
    },
  };
  function Harness({ messages }) {
    const ownership = useVirtualizedBottomSettle(
      hostRef,
      listRef,
      itemCount,
      (atBottom) =>
        anchoredRef.current?.onVirtualizerAtBottomStateChange(atBottom),
    );
    const messageItemIndexByIdRef = React.useRef(
      new Map(rows.map((row, index) => [row.dataset.messageId, index])),
    );
    const api = React.useMemo(
      () =>
        createListApi(
          ownership.cancel,
          ownership.settle,
          ownership.settleAfterLayout,
          ownership.preserveReadingPosition,
          ownership.isBottomPinned,
          messageItemIndexByIdRef,
          listRef,
        ),
      [
        ownership.cancel,
        ownership.settle,
        ownership.settleAfterLayout,
        ownership.preserveReadingPosition,
        ownership.isBottomPinned,
      ],
    );
    apiRef.current = api;
    const anchored = useTimelineAnchoredScroll(
      useAnchoredScroll,
      "channel",
      { current: null },
      false,
      messages,
      undefined,
      scrollRef,
      false,
      targetMessageId,
      api,
      true,
      0,
    );
    anchoredRef.current = anchored;
    useTimelineHandle(
      React,
      timelineRef,
      scrollRef,
      messages,
      api,
      anchored.scrollToBottomOnNextUpdate,
      anchored.settleAtBottomAfterLayout,
      () => {},
      anchored.scrollToMessage,
      captureReadingPosition,
      restoreReadingPosition,
    );
    return null;
  }
  const root = createRoot(document.createElement("div"));
  let messages = rows.map((row) => ({ id: row.dataset.messageId }));
  const flushFrames = async () => {
    for (let pass = 0; pass < 12 && frames.size; pass++) {
      const current = [...frames.values()];
      frames.clear();
      await act(async () => {
        for (const callback of current) callback(0);
      });
    }
    assert.equal(
      frames.size,
      0,
      "layout settlement must quiesce within 12 animation frames",
    );
  };
  await act(async () =>
    root.render(React.createElement(Harness, { messages })),
  );
  await flushFrames();
  return {
    model,
    scroller,
    rows,
    timelineRef,
    apiRef,
    anchoredRef,
    resize: async () => {
      await act(async () => {
        for (const observer of observers) observer.callback([]);
      });
      await flushFrames();
    },
    event: async (node, type) => {
      await act(async () =>
        node.dispatchEvent(
          new Event(type, { bubbles: type !== "pointerleave" }),
        ),
      );
      await flushFrames();
    },
    incoming: async (id) => {
      messages = [...messages, { id }];
      await act(async () =>
        root.render(React.createElement(Harness, { messages })),
      );
      await flushFrames();
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
      globalThis.ResizeObserver = prior.resize;
      globalThis.requestAnimationFrame = prior.raf;
      globalThis.cancelAnimationFrame = prior.cancel;
    },
  };
}

for (const growth of [16, 128]) {
  test(`MessageTimeline public layout settlement physically settles ${growth}px idle bottom growth`, async () => {
    const h = await mount();
    try {
      const pins = h.model.pins;
      h.model.height += growth;
      let result;
      await act(async () => {
        result = h.timelineRef.current.settleAtBottom();
      });
      assert.equal(result, true);
      assert.equal(h.model.pins, pins + 1);
      assert.equal(h.model.top, h.model.height - h.model.viewport);
      await h.resize();
      assert.equal(
        h.model.pins,
        pins + 1,
        "settled resize cannot start another pin loop",
      );
    } finally {
      await h.close();
    }
  });
}

test("hover owns its row through queued growth; leave re-arms only at the physical bottom", async () => {
  const h = await mount();
  try {
    const row = h.rows[32];
    await h.event(row, "pointermove");
    const top = row.getBoundingClientRect().top,
      pins = h.model.pins;
    h.model.height += 128;
    await h.resize();
    assert.equal(row.getBoundingClientRect().top, top);
    assert.equal(h.model.pins, pins);
    let result;
    await act(async () => {
      result = h.timelineRef.current.settleAtBottom();
    });
    assert.equal(result, false);
    assert.equal(h.model.pins, pins);
    let clicks = 0;
    row.querySelector("button").addEventListener("click", () => clicks++);
    await h.event(row.querySelector("button"), "pointerdown");
    row.querySelector("button").click();
    assert.equal(clicks, 1);
    assert.ok(Math.abs(row.getBoundingClientRect().top - top) <= 1);
    assert.equal(h.model.pins, pins);
    await h.event(h.scroller, "pointerleave");
    assert.equal(
      h.apiRef.current.isBottomPinned(),
      false,
      "leaving above the floor does not re-arm",
    );
    h.scroller.scrollTop = h.model.height - h.model.viewport;
    await h.event(h.scroller, "scroll");
    await h.event(h.scroller, "pointerleave");
    assert.equal(h.apiRef.current.isBottomPinned(), true);
    h.model.height += 80;
    await h.resize();
    assert.equal(h.model.top, h.model.height - h.model.viewport);
  } finally {
    await h.close();
  }
});

test("mid-history incoming preserves the partially visible first row, focus, draft and caret", async () => {
  const h = await mount();
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  editor.tabIndex = 0;
  editor.textContent = "Keep this exact draft";
  document.body.append(editor);
  try {
    h.scroller.scrollTop = 615;
    await h.event(h.scroller, "wheel");
    await h.event(h.scroller, "scroll");
    const row = h.rows[15],
      top = row.getBoundingClientRect().top,
      pins = h.model.pins;
    assert.equal(
      top,
      -15,
      "the first visible row is partially above the viewport",
    );
    editor.focus();
    assert.equal(document.activeElement, editor);
    const range = document.createRange();
    range.setStart(editor.firstChild, 7);
    range.collapse(true);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    h.model.shiftFrom = 15;
    h.model.shift = 64;
    h.model.height += 64;
    await h.incoming("incoming-above");
    await h.resize();
    assert.equal(row.getBoundingClientRect().top, top);
    assert.equal(h.model.pins, pins);
    h.model.height += 40;
    await h.incoming("incoming-below");
    await h.resize();
    assert.equal(row.getBoundingClientRect().top, top);
    assert.equal(h.model.pins, pins);
    assert.equal(document.activeElement, editor);
    assert.equal(editor.textContent, "Keep this exact draft");
    assert.equal(selection.anchorOffset, 7);
    assert.equal(selection.focusOffset, 7);
    assert.equal(h.anchoredRef.current.newMessageCount, 2);
  } finally {
    editor.remove();
    await h.close();
  }
});

test("selected-message navigation preserves its reading position without a bottom jump", async () => {
  const h = await mount();
  try {
    await act(async () => h.anchoredRef.current.scrollToMessage("row-32"));
    await h.event(h.scroller, "scroll");
    const row = h.rows[32],
      top = row.getBoundingClientRect().top,
      pins = h.model.pins;
    h.model.shiftFrom = 0;
    h.model.shift = 60;
    h.model.height += 60;
    let result;
    await act(async () => {
      result = h.timelineRef.current.settleAtBottom();
    });
    assert.equal(result, false);
    assert.equal(row.getBoundingClientRect().top, top);
    assert.equal(h.model.pins, pins);
  } finally {
    await h.close();
  }
});

test("focused inline editor keeps its row and selection through bottom queue growth", async () => {
  const h = await mount();
  const inline = document.createElement("div");
  inline.dataset.testid = "inline-thread";
  const editor = document.createElement("textarea");
  editor.value = "Keep inline draft";
  inline.append(editor);
  h.rows[32].append(inline);
  try {
    const row = h.rows[32];
    await act(async () => {
      editor.focus();
      editor.setSelectionRange(7, 7);
    });
    await h.event(editor, "focusin");
    const top = row.getBoundingClientRect().top;
    const pins = h.model.pins;
    h.model.height += 128;
    await h.resize();
    let result;
    await act(async () => {
      result = h.timelineRef.current.settleAtBottom();
    });
    assert.equal(result, false);
    assert.equal(h.model.pins, pins);
    assert.ok(Math.abs(row.getBoundingClientRect().top - top) <= 1);
    assert.equal(document.activeElement, editor);
    assert.equal(editor.value, "Keep inline draft");
    assert.equal(editor.selectionStart, 7);
    assert.equal(editor.selectionEnd, 7);
  } finally {
    await h.close();
  }
});

test("selected message text owns its row through queued geometry growth", async () => {
  const h = await mount();
  const selection = document.getSelection();
  try {
    const row = h.rows[32];
    const range = document.createRange();
    range.setStart(row.querySelector("button").firstChild, 0);
    range.setEnd(row.querySelector("button").firstChild, 2);
    selection.removeAllRanges();
    selection.addRange(range);
    await h.event(document, "selectionchange");
    const top = row.getBoundingClientRect().top;
    const pins = h.model.pins;
    h.model.shiftFrom = 32;
    h.model.shift = 64;
    h.model.height += 128;
    await h.resize();
    let result;
    await act(async () => {
      result = h.timelineRef.current.settleAtBottom();
    });
    assert.equal(result, false);
    assert.equal(h.model.pins, pins);
    assert.ok(Math.abs(row.getBoundingClientRect().top - top) <= 1);
    assert.equal(selection.toString(), "Re");
  } finally {
    selection.removeAllRanges();
    await h.close();
  }
});

test("growth between the first visible row and focused inline editor preserves the editor row", async () => {
  const h = await mount();
  const inline = document.createElement("div");
  inline.dataset.testid = "inline-thread";
  inline.dataset.threadHeadId = "row-30";
  const editor = document.createElement("textarea");
  editor.value = "Keep this focused inline draft";
  const composer = document.createElement("div");
  composer.dataset.testid = "message-composer";
  composer.append(editor);
  const footer = document.createElement("footer");
  footer.dataset.composerTargetId = "row-30";
  footer.append(composer);
  inline.append(footer);
  // Production InlineChannelThread renders its composer after the reply rows,
  // not inside any article[data-message-id]. Model that exact ancestor shape.
  h.scroller.firstElementChild.append(inline);
  composer.getBoundingClientRect = () => h.rows[32].getBoundingClientRect();
  editor.getBoundingClientRect = () => composer.getBoundingClientRect();
  try {
    const row = composer;
    assert.equal(editor.closest("[data-message-id]"), null);
    await act(async () => {
      editor.focus();
      editor.setSelectionRange(7, 7);
    });
    await h.event(editor, "focusin");
    const firstVisible = h.rows[30];
    assert.equal(firstVisible.getBoundingClientRect().top, 0);
    const top = row.getBoundingClientRect().top;
    assert.ok(top > firstVisible.getBoundingClientRect().top);
    const pins = h.model.pins;
    // A preceding inline/media row grows inside the viewport, between the
    // first intersecting row and the editor the reader is actively using.
    h.model.shiftFrom = 32;
    h.model.shift = 64;
    h.model.height += 128;
    await h.resize();
    let result;
    await act(async () => {
      result = h.timelineRef.current.settleAtBottom();
    });
    assert.equal(result, false);
    assert.equal(h.model.pins, pins);
    assert.ok(Math.abs(row.getBoundingClientRect().top - top) <= 1);
    assert.equal(document.activeElement, editor);
    assert.equal(editor.value, "Keep this focused inline draft");
    assert.equal(editor.selectionStart, 7);
    assert.equal(editor.selectionEnd, 7);
    await h.event(h.scroller, "pointerleave");
    assert.equal(h.apiRef.current.isBottomPinned(), false);
    assert.ok(Math.abs(row.getBoundingClientRect().top - top) <= 1);
  } finally {
    await h.close();
  }
});

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement as h, useRef } from "react";
import { createMemoryHistory } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { createSendScrollHistory } from "./sendScrollHistory.ts";
import {
  getStayWhenSending,
  setStayWhenSending,
} from "./sendScrollPreference.ts";
import {
  isMoreThanViewportFromBottom,
  useSendScrollReturn,
} from "./useSendScrollReturn.tsx";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const first = { id: "first", offset: -16, pixel: 200, neighbors: ["next"] };
const second = { id: "second", offset: -9, pixel: 300, neighbors: ["next"] };

function setup() {
  const history = createMemoryHistory({
    initialEntries: ["/home", "/channel?thread=t"],
  });
  const frames = new Map();
  const oldFrame = globalThis.requestAnimationFrame;
  const oldCancel = globalThis.cancelAnimationFrame;
  const oldSetTimeout = window.setTimeout;
  const oldClearTimeout = window.clearTimeout;
  let nextFrame = 0;
  let expire;
  globalThis.requestAnimationFrame = (fn) => {
    frames.set(++nextFrame, fn);
    return nextFrame;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  window.setTimeout = (fn, delay, ...args) => {
    if (delay !== 30_000) return oldSetTimeout.call(window, fn, delay, ...args);
    expire = fn;
    return -23;
  };
  window.clearTimeout = (id) => {
    if (id === -23) expire = undefined;
    else oldClearTimeout.call(window, id);
  };

  const report = { restored: [], jumped: [], prepared: [], position: first };
  function Fixture({ scope }) {
    const containerRef = useRef(null);
    const flow = useSendScrollReturn({
      history,
      scope,
      getView: () => ({
        container: containerRef.current,
        capture: () => report.position,
        prepare: (id) => report.prepared.push(id),
        jump: (id) => {
          report.jumped.push(id);
          containerRef.current.scrollTop = 1700;
          fireEvent.scroll(containerRef.current);
          return true;
        },
        restore: (position) => {
          report.restored.push(position);
          containerRef.current.scrollTop = position.pixel;
        },
      }),
    });
    report.capture = flow.capture;
    return h(
      "div",
      {},
      h("div", { "data-testid": "scroll", ref: containerRef }),
      flow.notice,
    );
  }
  const rendered = render(h(Fixture, { scope: "account/channel/thread" }));
  const scroller = rendered.getByTestId("scroll");
  Object.defineProperties(scroller, {
    clientHeight: { value: 300 },
    scrollHeight: { value: 2000 },
  });
  scroller.scrollTop = first.pixel;
  return {
    history,
    report,
    scroller,
    rendered,
    flush() {
      act(() => {
        const batch = [...frames.values()];
        frames.clear();
        for (const callback of batch) callback(0);
      });
    },
    expire() {
      act(() => expire());
    },
    close() {
      rendered.unmount();
      globalThis.requestAnimationFrame = oldFrame;
      globalThis.cancelAnimationFrame = oldCancel;
      window.setTimeout = oldSetTimeout;
      window.clearTimeout = oldClearTimeout;
    },
    switchScope() {
      rendered.rerender(
        h(Fixture, { scope: "different-account/channel/thread" }),
      );
    },
  };
}

test("more than a whole viewport is strict and excludes zero-height views", () => {
  const metrics = { clientHeight: 100, scrollHeight: 400, scrollTop: 200 };
  assert.equal(isMoreThanViewportFromBottom(metrics), false);
  assert.equal(
    isMoreThanViewportFromBottom({ ...metrics, scrollTop: 199 }),
    true,
  );
  assert.equal(
    isMoreThanViewportFromBottom({ ...metrics, clientHeight: 0 }),
    false,
  );
});

test("only a confirmed ID is jumped to, and the existing Back entry restores exact position once", () => {
  const view = setup();
  try {
    let attempt;
    act(() => {
      attempt = view.report.capture();
    });
    assert.ok(attempt);
    assert.deepEqual(view.report.jumped, []);
    act(() => attempt.published("ack-id"));
    view.flush();
    assert.deepEqual(view.report.jumped, ["ack-id"]);
    assert.ok(
      view.rendered.getByRole("button", { name: "↩ Back to where you were" }),
    );
    assert.equal(view.history.location.state.__TSR_index, 2);
    fireEvent.click(view.rendered.getByTestId("send-scroll-back"));
    assert.deepEqual(view.report.restored, [first]);
    assert.equal(view.scroller.scrollTop, first.pixel);
    assert.equal(view.history.location.href, "/channel?thread=t");
    act(() => view.history.back());
    assert.equal(view.history.location.href, "/home");
  } finally {
    view.close();
  }
});

test("automatic scroll keeps the pill, while a manual scroll and 30-second timeout hide only the pill", () => {
  const view = setup();
  try {
    act(() => view.report.capture().published("ack"));
    view.flush();
    fireEvent.scroll(view.scroller);
    assert.ok(view.rendered.getByTestId("send-scroll-back"));
    fireEvent.wheel(view.scroller, { deltaY: -10 });
    view.scroller.scrollTop -= 10;
    fireEvent.scroll(view.scroller);
    assert.equal(view.rendered.queryByTestId("send-scroll-back"), null);
    act(() => view.history.back());

    act(() => view.report.capture().published("ack-2"));
    view.flush();
    assert.ok(view.rendered.getByTestId("send-scroll-back"));
    view.expire();
    assert.equal(view.rendered.queryByTestId("send-scroll-back"), null);
    act(() => view.history.back());
    assert.deepEqual(view.report.restored, [first, first]);
  } finally {
    view.close();
  }
});

test("the opt-in keeps the exact position and the Sent chip jumps from the current reading point", () => {
  const view = setup();
  try {
    assert.equal(getStayWhenSending(), false);
    setStayWhenSending(true);
    act(() => view.report.capture().published("accepted"));
    view.flush();
    assert.equal(view.scroller.scrollTop, first.pixel);
    assert.deepEqual(view.report.jumped, []);
    assert.equal(view.history.location.state.__TSR_index, 1);
    view.report.position = second;
    fireEvent.click(view.rendered.getByTestId("send-scroll-sent"));
    view.flush();
    assert.deepEqual(view.report.jumped, ["accepted"]);
    act(() => view.history.back());
    assert.deepEqual(view.report.restored, [second]);
  } finally {
    view.close();
  }
});

test("failed, unacknowledged and stale-scope sends create no receipt or history entry", () => {
  const view = setup();
  try {
    act(() => view.report.capture().cancel());
    act(() => view.report.capture().published());
    let previous;
    act(() => {
      previous = view.report.capture();
    });
    view.switchScope();
    act(() => previous.published("accepted-in-previous-account"));
    view.flush();
    assert.equal(view.rendered.queryByRole("button"), null);
    assert.deepEqual(view.report.jumped, []);
    assert.equal(view.history.location.state.__TSR_index, 1);
  } finally {
    view.close();
  }
});

test("editing a queued send cancels its original receipt and preserves the outbox callback", () => {
  const view = setup();
  try {
    let edited = false;
    act(() => {
      const attempt = view.report.capture();
      const bound = attempt.bindOutbox({
        onSuperseded: () => {
          edited = true;
        },
      });
      bound.onSuperseded();
      attempt.published("accepted-edited-draft");
    });
    view.flush();
    assert.equal(edited, true);
    assert.equal(view.rendered.queryByRole("button"), null);
    assert.deepEqual(view.report.jumped, []);
  } finally {
    view.close();
  }
});

test("a second pane reuses the router's current jump entry and leaves ordinary Back intact", () => {
  const history = createMemoryHistory({
    initialEntries: ["/home", "/channel"],
  });
  const timeline = createSendScrollHistory(history);
  const thread = createSendScrollHistory(history);
  const actions = [];
  const firstUnsubscribe = timeline.subscribe(() =>
    actions.push("timeline leave"),
  );
  const secondUnsubscribe = thread.subscribe(() =>
    actions.push("thread leave"),
  );
  try {
    assert.equal(
      timeline.push(() => actions.push("timeline restore")),
      true,
    );
    assert.equal(
      thread.push(() => actions.push("thread restore")),
      true,
    );
    assert.equal(history.location.state.__TSR_index, 2);
    assert.equal(timeline.ownsCurrent(), false);
    assert.equal(thread.ownsCurrent(), true);
    history.back();
    assert.deepEqual(actions, [
      "timeline leave",
      "thread restore",
      "thread leave",
    ]);
    history.back();
    assert.equal(history.location.href, "/home");
  } finally {
    firstUnsubscribe();
    secondUnsubscribe();
  }
});

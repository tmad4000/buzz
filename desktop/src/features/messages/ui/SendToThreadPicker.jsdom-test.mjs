import assert from "node:assert/strict";
import { test } from "node:test";
import React, { act } from "react";
import { render, fireEvent, within, cleanup } from "@testing-library/react";
import { SendToThreadPicker } from "./SendToThreadPicker.tsx";

test("simultaneous picker instances keep candidates, choice and disabled ownership local", async () => {
  const calls = [];
  const entries = (id, body) => [
    {
      message: {
        id,
        body,
        author: "Nora",
        createdAt: 100,
        depth: 0,
        time: "now",
        kind: 9,
      },
      summary: null,
    },
  ];
  const left = entries("left-root", "Left release topic");
  const right = entries("right-root", "Right design topic");
  function Harness({ disabled = false }) {
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "section",
        { "data-testid": "left" },
        React.createElement(SendToThreadPicker, {
          entries: left,
          disabled,
          getDraft: () => "release",
          onPick: (id) => calls.push(["left", id]),
        }),
      ),
      React.createElement(
        "section",
        { "data-testid": "right" },
        React.createElement(SendToThreadPicker, {
          entries: right,
          disabled: false,
          getDraft: () => "design",
          onPick: (id) => calls.push(["right", id]),
        }),
      ),
    );
  }
  const view = render(React.createElement(Harness));
  try {
    const leftButton = within(view.getByTestId("left")).getByRole("button");
    const rightButton = within(view.getByTestId("right")).getByRole("button");
    await act(async () => fireEvent.click(leftButton));
    assert.equal(leftButton.getAttribute("aria-expanded"), "true");
    assert.equal(rightButton.getAttribute("aria-expanded"), "false");
    assert.match(view.getByRole("menu").textContent, /Left release topic/);
    assert.doesNotMatch(
      view.getByRole("menu").textContent,
      /Right design topic/,
    );
    assert.deepEqual(calls, []);
    // Losing composer ownership dismisses this instance without publishing.
    await act(async () =>
      view.rerender(React.createElement(Harness, { disabled: true })),
    );
    assert.equal(view.queryByRole("menu"), null);
    assert.equal(leftButton.disabled, true);
    await act(async () => fireEvent.click(rightButton));
    assert.match(view.getByRole("menu").textContent, /Right design topic/);
    assert.doesNotMatch(
      view.getByRole("menu").textContent,
      /Left release topic/,
    );
    await act(async () =>
      fireEvent.click(
        view.getByRole("menuitem", { name: /Right design topic/ }),
      ),
    );
    assert.deepEqual(calls, [["right", "right-root"]]);
    assert.equal(view.queryByRole("menu"), null);
  } finally {
    cleanup();
  }
});

import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { MessageTimestamp } from "./MessageTimestamp.tsx";
test("both message layouts show relative time and retain exact source datetime", () => {
  const createdAt = Math.floor(Date.now() / 1000) - 300;
  try {
    for (const hideDayPeriod of [false, true]) {
      const view = render(
        React.createElement(MessageTimestamp, { createdAt, hideDayPeriod }),
      );
      const time = view.getByTestId("message-timestamp");
      assert.equal(time.tagName, "TIME");
      assert.equal(time.textContent, "5m ago");
      assert.equal(time.dateTime, new Date(createdAt * 1000).toISOString());
      assert.ok(time.title.includes("UTC"));
      cleanup();
    }
  } finally {
    cleanup();
  }
});

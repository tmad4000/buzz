import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MessageEditStamp } from "./MessageEditStamp.tsx";
const render = (at) =>
  renderToStaticMarkup(
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(MessageEditStamp, { editedAt: at }),
    ),
  );
test("edited stamp uses authorized edit time and safely falls back for out-of-Date-range author time", () => {
  const html = render(1700000200);
  assert.match(html, /\(edited\)/);
  assert.match(html, /2023-11-14T22:16:40.000Z/);
  assert.match(html, /title="Edited /);
  for (const at of [undefined, NaN, Infinity, 1e15, -1e15]) {
    const fallback = render(at);
    assert.match(fallback, /\(edited\)/);
    assert.match(fallback, /This message has been edited/);
    assert.doesNotMatch(fallback, /dateTime=/i);
  }
});

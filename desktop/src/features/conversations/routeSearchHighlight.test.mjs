import assert from "node:assert/strict";
import test from "node:test";
import { admittedRouteSearchHighlight } from "./routeSearchHighlight.ts";

const highlight = {
  activationId: "action",
  messageId: "message",
  query: "needle",
};
const route = {
  channelId: "chat",
  search: { messageId: "message" },
  state: { searchHighlight: highlight },
};

test("only the admitted canonical conversation/message receives a search activation", () => {
  assert.deepEqual(
    admittedRouteSearchHighlight(route, "chat", false),
    highlight,
  );
  assert.equal(
    admittedRouteSearchHighlight(route, "sibling", false),
    undefined,
  );
  assert.equal(
    admittedRouteSearchHighlight(
      { ...route, search: { messageId: "other" } },
      "chat",
      false,
    ),
    null,
  );
});

test("local projection keeps an existing local highlight while an explicit plain route clears it", () => {
  const plain = { ...route, state: { searchHighlight: null } };
  assert.equal(admittedRouteSearchHighlight(plain, "chat", true), undefined);
  assert.equal(admittedRouteSearchHighlight(plain, "chat", false), null);
  assert.deepEqual(
    admittedRouteSearchHighlight(route, "chat", true),
    highlight,
  );
});

test("malformed history payload cannot activate a highlight", () => {
  for (const state of [
    null,
    {},
    { searchHighlight: { ...highlight, activationId: "" } },
  ])
    assert.equal(
      admittedRouteSearchHighlight({ ...route, state }, "chat", false),
      null,
    );
});

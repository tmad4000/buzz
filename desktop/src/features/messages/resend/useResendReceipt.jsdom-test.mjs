import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
let filters = [];
let callbacks = [];
let history = [];
globalThis.resendTestRelay = {
  subscribeLive: async (_f, cb) => {
    filters.push(_f);
    callbacks.push(cb);
    return () => {};
  },
  fetchEvents: async () => history,
};
registerHooks({
  resolve(s, c, n) {
    if (s === "@/shared/api/relayClient")
      return { shortCircuit: true, url: "resend-test:relay" };
    return n(s, c);
  },
  load(u, c, n) {
    if (u === "resend-test:relay")
      return {
        shortCircuit: true,
        format: "module",
        source: "export const relayClient=globalThis.resendTestRelay;",
      };
    return n(u, c);
  },
});
const { useResendReceipt } = await import("./useResendReceipt.ts");
const { setResendReceipt, getResendReceipt } = await import(
  "./receiptStore.ts"
);
const { receiptKey, PASEO_PUBKEY } = await import("./protocol.ts");
const actor = "a".repeat(64);
let latest;
function Probe({ id, edit }) {
  latest = useResendReceipt("channel", actor, id, edit);
  return React.createElement("span", null, latest?.phase ?? "none");
}
const ack = (trigger, overrides = {}) => ({
  id: "ack",
  kind: 7,
  pubkey: PASEO_PUBKEY,
  content: "👀",
  tags: [
    ["h", "channel"],
    ["e", trigger],
  ],
  ...overrides,
});
function mount() {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  return {
    render: async (id, edit) =>
      act(async () => root.render(React.createElement(Probe, { id, edit }))),
    close: async () =>
      act(() => {
        root.unmount();
        node.remove();
      }),
  };
}
test("Pending survives publish acceptance and non-Paseo/wrong-target eyes; only actual acknowledgement says Sent", async () => {
  localStorage.setItem("buzz-active-community-id", "one");
  callbacks = [];
  history = [];
  const key = receiptKey("one", actor, "channel", "msg", "edit");
  setResendReceipt(key, { event: { id: "trigger" }, phase: "pending" });
  const app = mount();
  await app.render("msg", "edit");
  assert.equal(latest.phase, "pending");
  for (const e of [
    ack("trigger", { pubkey: actor }),
    ack("msg"),
    ack("trigger", { content: "🔁" }),
    ack("trigger", {
      tags: [
        ["h", "elsewhere"],
        ["e", "trigger"],
      ],
    }),
  ])
    await act(() => callbacks[0](e));
  assert.equal(latest.phase, "pending");
  await act(() => callbacks[0](ack("trigger")));
  assert.equal(latest.phase, "sent");
  await app.close();
});
test("history ack recovers after remount; old edit/view/community callbacks cannot acknowledge a new request", async () => {
  localStorage.setItem("buzz-active-community-id", "one");
  callbacks = [];
  history = [];
  const key = receiptKey("one", actor, "channel", "m2", "old");
  setResendReceipt(key, { event: { id: "old-trigger" }, phase: "pending" });
  const newer = receiptKey("one", actor, "channel", "m2", "new");
  setResendReceipt(newer, { event: { id: "new-trigger" }, phase: "pending" });
  const app = mount();
  await app.render("m2", "old");
  const stale = callbacks[0];
  await app.render("m2", "new");
  await act(() => stale(ack("old-trigger")));
  assert.equal(getResendReceipt(key).phase, "pending");
  assert.equal(latest.phase, "pending");
  localStorage.setItem("buzz-active-community-id", "two");
  await act(() => callbacks.at(-1)(ack("new-trigger")));
  assert.equal(getResendReceipt(newer).phase, "pending");
  await app.close();
  localStorage.setItem("buzz-active-community-id", "one");
  history = [ack("new-trigger")];
  const reopened = mount();
  await reopened.render("m2", "new");
  assert.equal(latest.phase, "sent");
  await reopened.close();
  history = [];
});

test("explicit retry restarts acknowledgement readback after a failed observation", async () => {
  localStorage.setItem("buzz-active-community-id", "one");
  callbacks = [];
  history = [];
  const key = receiptKey("one", actor, "channel", "retry-msg", "retry-edit");
  const event = { id: "retry-trigger" };
  setResendReceipt(key, { event, phase: "pending" });
  const app = mount();
  await app.render("retry-msg", "retry-edit");
  const before = callbacks.length;
  history = [ack(event.id)];
  await act(async () =>
    setResendReceipt(key, { event, phase: "pending", error: "offline" }),
  );
  assert.ok(callbacks.length > before);
  assert.equal(latest.phase, "sent");
  await app.close();
  history = [];
});

test("standard e-only Paseo acknowledgement is subscribed and accepted via its known trigger", async () => {
  localStorage.setItem("buzz-active-community-id", "one");
  callbacks = [];
  history = [];
  filters = [];
  const key = receiptKey("one", actor, "channel", "eonly-msg", "eonly-edit");
  setResendReceipt(key, {
    event: { id: "eonly-trigger", tags: [["h", "channel"]] },
    phase: "pending",
  });
  const app = mount();
  await app.render("eonly-msg", "eonly-edit");
  assert.equal(filters.length, 1);
  assert.equal(filters[0]["#h"], undefined);
  assert.deepEqual(filters[0]["#e"], ["eonly-trigger"]);
  await act(async () =>
    callbacks[0](ack("eonly-trigger", { tags: [["e", "eonly-trigger"]] })),
  );
  assert.equal(latest.phase, "sent");
  await app.close();
});

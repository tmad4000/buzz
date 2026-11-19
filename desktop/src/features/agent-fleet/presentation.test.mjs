import assert from "node:assert/strict";
import test from "node:test";
import { fleetPresentation } from "./presentation.ts";
const now = 1795047000;
const ready = () => ({
  availability: "ok",
  verifiedAt: now,
  counts: { running: 4, idle: 2, blocked: 0, needsPermission: 0, unknown: 0 },
  root: {
    state: "running",
    stateVerifiedAt: now,
    queueDepth: 3,
    queueVerifiedAt: now,
  },
});
test("fresh GCP working has scope, root proof, queue proof, and unknown external hosts", () => {
  const v = fleetPresentation(ready(), now);
  assert.equal(v.tone, "working");
  assert.equal(v.pulse, true);
  assert.equal(v.label, "GCP: 4 agents working · root busy · 3 queued");
  assert.equal(v.detail, "M4/M5 unknown");
});
test("known blocked/permission takes amber priority; unknown does not become idle", () => {
  for (const key of ["blocked", "needsPermission"]) {
    const q = ready();
    q.counts[key] = 1;
    const v = fleetPresentation(q, now);
    assert.equal(v.tone, "attention");
    assert.equal(v.pulse, false);
    assert.match(
      v.label,
      key === "blocked" ? /1 blocked/ : /1 awaiting permission/,
    );
  }
  const idle = ready();
  idle.counts.running = 0;
  idle.root.state = "idle";
  assert.equal(fleetPresentation(idle, now).tone, "idle");
  idle.counts.unknown = 2;
  assert.equal(fleetPresentation(idle, now).tone, "unknown");
  assert.match(fleetPresentation(idle, now).label, /2 states unknown/);
});
test("120 second freshness is strict and independent of attempted publication or root queue clocks", () => {
  const q = ready();
  assert.equal(fleetPresentation(q, now + 120).tone, "working");
  const stale = fleetPresentation(q, now + 121);
  assert.equal(stale.tone, "unknown");
  assert.match(stale.label, /stale/);
  assert.doesNotMatch(stale.label, /4 agents|3 queued|root idle/);
  q.root.queueVerifiedAt = now - 121;
  assert.match(fleetPresentation(q, now).label, /queue unknown/);
  q.root.stateVerifiedAt = now - 121;
  assert.match(fleetPresentation(q, now).label, /root state unknown/);
  q.availability = "unavailable";
  assert.match(fleetPresentation(q, now).label, /unknown/);
  assert.equal(fleetPresentation(undefined, now).pulse, false);
});

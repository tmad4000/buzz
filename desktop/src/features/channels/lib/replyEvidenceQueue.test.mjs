import assert from "node:assert/strict";
import test from "node:test";
import { createReplyEvidenceQueue } from "./replyEvidenceQueue.ts";
test("cold evidence caps concurrent history reads and rejects retired queued reads", async () => {
  const run = createReplyEvidenceQueue();
  const controller = new AbortController();
  const releases = [];
  let running = 0,
    peak = 0;
  const reads = Array.from({ length: 5 }, () =>
    run(controller.signal, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => releases.push(resolve));
      running--;
    }),
  );
  assert.equal(peak, 4);
  controller.abort();
  const settled = Promise.allSettled(reads);
  for (const release of releases) release();
  assert.equal(
    (await settled).filter((result) => result.status === "rejected").length,
    1,
  );
  assert.equal(peak, 4);
});

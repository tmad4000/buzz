import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedInlineThreadRead } from "./inlineThreadFetch.ts";
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
test("inline native reads are bounded to two; queued cancellation does not release an active slot", async () => {
  const one = deferred(),
    two = deferred(),
    three = deferred();
  let running = 0,
    max = 0;
  const work = (d) => async () => {
    running++;
    max = Math.max(max, running);
    await d.promise;
    running--;
    return "done";
  };
  const first = new AbortController(),
    second = new AbortController(),
    queued = new AbortController();
  const a = boundedInlineThreadRead(work(one), first.signal);
  const b = boundedInlineThreadRead(work(two), second.signal);
  const c = boundedInlineThreadRead(work(three), queued.signal);
  const rejected = assert.rejects(c, { name: "AbortError" });
  await Promise.resolve();
  assert.equal(running, 2);
  queued.abort();
  first.abort();
  await rejected;
  assert.equal(running, 2, "native work retains lease until completion");
  one.resolve();
  await a;
  two.resolve();
  await b;
  assert.equal(max, 2);
  assert.equal(running, 0);
  const final = await boundedInlineThreadRead(
    async () => "next",
    new AbortController().signal,
  );
  assert.equal(final, "next");
});

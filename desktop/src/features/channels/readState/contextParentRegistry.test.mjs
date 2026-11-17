import assert from "node:assert/strict";
import test from "node:test";
import {
  ContextParentRegistry,
  buildContextParents,
} from "./contextParentRegistry.ts";

test("duplicate-view cleanup preserves its sibling and unrelated resources never inherit", () => {
  const graph = new ContextParentRegistry();
  const releaseA = graph.register(new Map([["root", "general"]]));
  const releaseB = graph.register(
    new Map([
      ["root", "general"],
      ["reply", "general"],
    ]),
  );
  const releaseC = graph.register(new Map([["other-root", "random"]]));
  assert.equal(graph.resolve("msg:reply"), "general");
  assert.equal(graph.resolve("thread:other-root"), "random");
  assert.equal(graph.resolve("msg:unknown"), null);
  assert.equal(graph.resolve("general"), null);
  releaseA();
  releaseA();
  assert.equal(graph.resolve("thread:root"), "general");
  releaseC();
  assert.equal(graph.resolve("msg:other-root"), null);
  assert.equal(graph.resolve("msg:root"), "general");
  releaseB();
  assert.equal(graph.resolve("msg:root"), null);
});

test("conflicting parents do not acknowledge the wrong resource", () => {
  const graph = new ContextParentRegistry();
  graph.register(new Map([["root", "general"]]));
  const release = graph.register(new Map([["root", "random"]]));
  assert.equal(graph.resolve("msg:root"), null);
  release();
  assert.equal(graph.resolve("msg:root"), "general");
});

test("parent construction rejects wrong-channel route events and unverified references", () => {
  const graph = new ContextParentRegistry();
  graph.register(
    buildContextParents("a", [
      {
        id: "in-a",
        tags: [
          ["h", "a"],
          ["e", "in-b", "", "root"],
        ],
      },
      { id: "in-b", tags: [["h", "b"]] },
      { id: "unknown", tags: [] },
    ]),
  );
  assert.equal(graph.resolve("msg:in-a"), "a");
  assert.equal(graph.resolve("msg:in-b"), null);
  assert.equal(graph.resolve("thread:unknown"), null);
});
